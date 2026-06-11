require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY;
const YOCO_WEBHOOK_SECRET = process.env.YOCO_WEBHOOK_SECRET;

// Keep raw body for webhook verification.
app.use("/api/yoco-webhook", express.raw({ type: "application/json" }));
app.use(cors());
app.use(express.json());

const plans = {
  starter_monthly: { label: "Starter Monthly", amount: 4900, plan: "starter", months: 1 },
  pro_monthly: { label: "Pro Monthly", amount: 9900, plan: "pro", months: 1 },
  business_monthly: { label: "Business Monthly", amount: 19900, plan: "business", months: 1 }
};

function tokenFor(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid login token" });
  }
}

async function getUser(userId) {
  const result = await pool.query(
    "SELECT id,email,plan,subscription_active,subscription_expires_at FROM users WHERE id=$1",
    [userId]
  );
  return result.rows[0];
}

function requirePaid(req, res, next) {
  getUser(req.userId)
    .then(user => {
      const active = user && user.subscription_active && (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date());
      if (!active) return res.status(402).json({ error: "Paid plan required" });
      req.user = user;
      next();
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: "Plan check failed" });
    });
}

app.get("/", (req, res) => res.send("EmberTools backend is working"));

app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "Email and password of 6+ characters required" });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,plan,subscription_active,subscription_expires_at",
      [email.toLowerCase(), hash]
    );

    res.json({ success: true, token: tokenFor(result.rows[0].id), user: result.rows[0] });
  } catch (err) {
    if (String(err.message).includes("duplicate")) {
      return res.status(400).json({ error: "Email already registered" });
    }
    console.error(err);
    res.status(500).json({ error: "Register failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [String(email || "").toLowerCase()]);
    if (!result.rows.length) return res.status(401).json({ error: "Wrong email or password" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password || "", user.password_hash);
    if (!valid) return res.status(401).json({ error: "Wrong email or password" });

    res.json({
      success: true,
      token: tokenFor(user.id),
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        subscription_active: user.subscription_active,
        subscription_expires_at: user.subscription_expires_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/me", auth, async (req, res) => {
  res.json(await getUser(req.userId));
});

app.post("/api/create-checkout", auth, async (req, res) => {
  try {
    const { packageName } = req.body;
    const selected = plans[packageName];
    if (!selected) return res.status(400).json({ error: "Invalid package" });
    if (!YOCO_SECRET_KEY) return res.status(500).json({ error: "Yoco secret key missing" });

    const body = {
      amount: selected.amount,
      currency: "ZAR",
      successUrl: `${BASE_URL}/payment-success`,
      cancelUrl: `${BASE_URL}/payment-cancelled`,
      failureUrl: `${BASE_URL}/payment-failed`,
      metadata: {
        userId: req.userId,
        packageName,
        plan: selected.plan
      }
    };

    const yocoRes = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${YOCO_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const checkout = await yocoRes.json();

    if (!yocoRes.ok) {
      console.error(checkout);
      return res.status(500).json({ error: "Yoco checkout failed", details: checkout });
    }

    await pool.query(
      "INSERT INTO payments(user_id, checkout_id, package_name, amount_cents, status) VALUES($1,$2,$3,$4,'pending')",
      [req.userId, checkout.id || null, packageName, selected.amount]
    );

    res.json({
      success: true,
      redirectUrl: checkout.redirectUrl || checkout.url || checkout.checkoutUrl,
      checkout
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create checkout" });
  }
});

// Simple browser landing pages after hosted checkout.
app.get("/payment-success", (req, res) => res.send("Payment received. You may return to the EmberTools app."));
app.get("/payment-cancelled", (req, res) => res.send("Payment cancelled. You may return to the EmberTools app."));
app.get("/payment-failed", (req, res) => res.send("Payment failed. Please try again."));

// Webhook: configure this URL in Yoco as https://YOUR_BACKEND/api/yoco-webhook
app.post("/api/yoco-webhook", async (req, res) => {
  try {
    const rawBody = req.body;
    const payloadText = rawBody.toString("utf8");
    const event = JSON.parse(payloadText);

    // Yoco uses signed webhooks. Header names may differ depending on your Yoco dashboard/API version.
    // Keep this check enabled once you copy your webhook secret and confirm the signature header name in Yoco docs.
    if (YOCO_WEBHOOK_SECRET) {
      const signature = req.headers["webhook-signature"] || req.headers["svix-signature"] || "";
      const timestamp = req.headers["webhook-timestamp"] || req.headers["svix-timestamp"] || "";
      const id = req.headers["webhook-id"] || req.headers["svix-id"] || "";
      if (!signature || !timestamp || !id) {
        return res.status(400).send("Missing webhook signature headers");
      }
      // Standard Webhooks format. Verify against current Yoco webhook docs before live launch.
      const signedContent = `${id}.${timestamp}.${payloadText}`;
      const expected = crypto.createHmac("sha256", YOCO_WEBHOOK_SECRET.replace(/^whsec_/, ""))
        .update(signedContent)
        .digest("base64");
      if (!String(signature).includes(expected)) {
        return res.status(400).send("Invalid webhook signature");
      }
    }

    const data = event.data || event.payload || event;
    const metadata = data.metadata || {};
    const status = data.status || data.paymentStatus || event.type || "";
    const userId = Number(metadata.userId);
    const packageName = metadata.packageName;
    const selected = plans[packageName];

    const paid = /paid|succeeded|successful|checkout\.paid|payment\.succeeded/i.test(status);

    if (paid && userId && selected) {
      await pool.query("UPDATE payments SET status='paid' WHERE checkout_id=$1 OR user_id=$2", [data.id || data.checkoutId || null, userId]);

      await pool.query(
        `UPDATE users
         SET plan=$1,
             subscription_active=true,
             subscription_expires_at=COALESCE(subscription_expires_at, NOW()) + INTERVAL '1 month'
         WHERE id=$2`,
        [selected.plan, userId]
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Webhook error");
  }
});

function makeInvoice(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const vat = input.includeVat ? subtotal * 0.15 : 0;
  const total = subtotal + vat;

  return `INVOICE

Business: ${input.businessName || ""}
Client: ${input.clientName || ""}
Invoice No: ${input.invoiceNumber || "INV-001"}
Date: ${new Date().toLocaleDateString("en-ZA")}

Items:
${items.map(i => `- ${i.description}: ${i.qty} x R${Number(i.price || 0).toFixed(2)} = R${(Number(i.qty || 0) * Number(i.price || 0)).toFixed(2)}`).join("\n")}

Subtotal: R${subtotal.toFixed(2)}
VAT: R${vat.toFixed(2)}
Total Due: R${total.toFixed(2)}

Bank Details:
${input.bankDetails || ""}

Thank you for your business.`;
}

function makeQuote(input) {
  return `QUOTATION

Business: ${input.businessName || ""}
Client: ${input.clientName || ""}
Quote No: ${input.quoteNumber || "Q-001"}
Valid Until: ${input.validUntil || ""}

Work Description:
${input.workDescription || ""}

Estimated Price: R${Number(input.amount || 0).toFixed(2)}

Terms:
${input.terms || "50% deposit required before work starts."}`;
}

function makeCv(input) {
  return `${input.fullName || "Your Name"}
${input.email || ""} | ${input.phone || ""} | ${input.location || ""}

PROFESSIONAL SUMMARY
${input.summary || "Hard-working and reliable professional with strong communication skills and a willingness to learn."}

WORK EXPERIENCE
${input.experience || ""}

EDUCATION
${input.education || ""}

SKILLS
${input.skills || ""}

REFERENCES
Available on request.`;
}

function makeCoverLetter(input) {
  return `Dear Hiring Manager,

I am applying for the ${input.jobTitle || "position"} at ${input.company || "your company"}.

I believe I would be a strong fit because ${input.reason || "I am reliable, motivated, and eager to contribute."}

My experience includes:
${input.experience || ""}

Thank you for considering my application. I would appreciate the opportunity to discuss how I can add value to your team.

Kind regards,
${input.fullName || "Your Name"}`;
}

function makeContract(input) {
  return `SERVICE AGREEMENT

This agreement is between ${input.provider || "Service Provider"} and ${input.client || "Client"}.

Service:
${input.service || ""}

Price:
R${Number(input.price || 0).toFixed(2)}

Payment Terms:
${input.paymentTerms || "Payment is due upon completion unless otherwise agreed."}

Start Date:
${input.startDate || ""}

Additional Terms:
${input.terms || ""}

Signed by Provider: ___________________

Signed by Client: ___________________`;
}

const toolFns = {
  invoice: makeInvoice,
  quote: makeQuote,
  cv: makeCv,
  cover_letter: makeCoverLetter,
  contract: makeContract
};

app.post("/api/tools/:tool", auth, async (req, res) => {
  try {
    const tool = req.params.tool;
    if (!toolFns[tool]) return res.status(404).json({ error: "Tool not found" });

    // Free users can use invoice and quote only.
    if (!["invoice", "quote"].includes(tool)) {
      const user = await getUser(req.userId);
      const active = user && user.subscription_active && (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date());
      if (!active) return res.status(402).json({ error: "Upgrade required for this tool" });
    }

    const content = toolFns[tool](req.body || {});
    const saved = await pool.query(
      "INSERT INTO documents(user_id, tool, title, content) VALUES($1,$2,$3,$4) RETURNING *",
      [req.userId, tool, req.body.title || tool, content]
    );

    res.json({ success: true, document: saved.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate document" });
  }
});

app.get("/api/documents", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,tool,title,content,created_at FROM documents WHERE user_id=$1 ORDER BY id DESC LIMIT 50",
    [req.userId]
  );
  res.json(result.rows);
});

app.listen(PORT, () => {
  console.log(`EmberTools backend running on ${BASE_URL}`);
});
