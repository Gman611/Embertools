import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Linking
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";

const API_URL = "https://YOUR_BACKEND_URL_HERE"; // Example: https://embertools-api.onrender.com

function Button({ title, onPress, secondary }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.button, secondary && styles.secondaryButton]}>
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, multiline }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        style={[styles.input, multiline && { minHeight: 90, textAlignVertical: "top" }]}
        placeholderTextColor="#999"
      />
    </View>
  );
}

export default function App() {
  const [token, setToken] = useState("");
  const [screen, setScreen] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [me, setMe] = useState(null);
  const [output, setOutput] = useState("");
  const [docs, setDocs] = useState([]);

  const [form, setForm] = useState({
    businessName: "",
    clientName: "",
    invoiceNumber: "INV-001",
    quoteNumber: "Q-001",
    bankDetails: "",
    workDescription: "",
    amount: "",
    fullName: "",
    phone: "",
    location: "",
    summary: "",
    experience: "",
    education: "",
    skills: "",
    jobTitle: "",
    company: "",
    reason: "",
    provider: "",
    client: "",
    service: "",
    price: "",
    paymentTerms: "",
    startDate: "",
    terms: ""
  });

  function setF(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function api(path, method = "GET", body) {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : ""
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function saveToken(newToken) {
    setToken(newToken);
    await AsyncStorage.setItem("token", newToken);
  }

  async function register() {
    try {
      const data = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      }).then(r => r.json());
      if (!data.token) throw new Error(data.error || "Register failed");
      await saveToken(data.token);
      setMe(data.user);
      setScreen("home");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  async function login() {
    try {
      const data = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      }).then(r => r.json());
      if (!data.token) throw new Error(data.error || "Login failed");
      await saveToken(data.token);
      setMe(data.user);
      setScreen("home");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  async function logout() {
    await AsyncStorage.removeItem("token");
    setToken("");
    setMe(null);
    setScreen("login");
  }

  async function loadMe(savedToken = token) {
    if (!savedToken) return;
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMe(data);
        setScreen("home");
      }
    } catch {}
  }

  async function buy(packageName) {
    try {
      const data = await api("/api/create-checkout", "POST", { packageName });
      if (data.redirectUrl) Linking.openURL(data.redirectUrl);
      else Alert.alert("Payment error", "No redirect URL received");
    } catch (e) {
      Alert.alert("Payment error", e.message);
    }
  }

  async function generate(tool, payload) {
    try {
      const data = await api(`/api/tools/${tool}`, "POST", payload);
      setOutput(data.document.content);
      setScreen("output");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  async function loadDocs() {
    try {
      const data = await api("/api/documents");
      setDocs(data);
      setScreen("docs");
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  useEffect(() => {
    AsyncStorage.getItem("token").then(t => {
      if (t) {
        setToken(t);
        loadMe(t);
      }
    });
  }, []);

  if (screen === "login") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.inner}>
          <Text style={styles.title}>EmberTools</Text>
          <Text style={styles.subtitle}>Business tools for South Africans</Text>

          <Field label="Email" value={email} onChangeText={setEmail} />
          <Field label="Password" value={password} onChangeText={setPassword} />

          <Button title="Login" onPress={login} />
          <Button title="Register" onPress={register} secondary />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "home") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.inner}>
          <Text style={styles.title}>EmberTools</Text>
          <Text style={styles.card}>Logged in: {me?.email || ""}{"\n"}Plan: {me?.subscription_active ? me?.plan : "free"}</Text>

          <Button title="Invoice Generator" onPress={() => setScreen("invoice")} />
          <Button title="Quote Generator" onPress={() => setScreen("quote")} />
          <Button title="CV Builder - Pro" onPress={() => setScreen("cv")} />
          <Button title="Cover Letter - Pro" onPress={() => setScreen("cover")} />
          <Button title="Contract Generator - Pro" onPress={() => setScreen("contract")} />
          <Button title="My Documents" onPress={loadDocs} secondary />

          <Text style={styles.section}>Upgrade</Text>
          <Button title="Starter - R49/month" onPress={() => buy("starter_monthly")} />
          <Button title="Pro - R99/month" onPress={() => buy("pro_monthly")} />
          <Button title="Business - R199/month" onPress={() => buy("business_monthly")} />

          <Button title="Refresh Plan" onPress={() => loadMe()} secondary />
          <Button title="Logout" onPress={logout} secondary />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "invoice") {
    return (
      <ToolWrap title="Invoice Generator" back={() => setScreen("home")}>
        <Field label="Business Name" value={form.businessName} onChangeText={v => setF("businessName", v)} />
        <Field label="Client Name" value={form.clientName} onChangeText={v => setF("clientName", v)} />
        <Field label="Invoice Number" value={form.invoiceNumber} onChangeText={v => setF("invoiceNumber", v)} />
        <Field label="Bank Details" value={form.bankDetails} onChangeText={v => setF("bankDetails", v)} multiline />
        <Button title="Generate Invoice" onPress={() => generate("invoice", {
          businessName: form.businessName,
          clientName: form.clientName,
          invoiceNumber: form.invoiceNumber,
          bankDetails: form.bankDetails,
          includeVat: true,
          items: [
            { description: "Service", qty: 1, price: Number(form.amount || 0) || 500 }
          ]
        })} />
      </ToolWrap>
    );
  }

  if (screen === "quote") {
    return (
      <ToolWrap title="Quote Generator" back={() => setScreen("home")}>
        <Field label="Business Name" value={form.businessName} onChangeText={v => setF("businessName", v)} />
        <Field label="Client Name" value={form.clientName} onChangeText={v => setF("clientName", v)} />
        <Field label="Work Description" value={form.workDescription} onChangeText={v => setF("workDescription", v)} multiline />
        <Field label="Amount" value={form.amount} onChangeText={v => setF("amount", v)} />
        <Button title="Generate Quote" onPress={() => generate("quote", form)} />
      </ToolWrap>
    );
  }

  if (screen === "cv") {
    return (
      <ToolWrap title="CV Builder" back={() => setScreen("home")}>
        <Field label="Full Name" value={form.fullName} onChangeText={v => setF("fullName", v)} />
        <Field label="Email" value={email} onChangeText={setEmail} />
        <Field label="Phone" value={form.phone} onChangeText={v => setF("phone", v)} />
        <Field label="Location" value={form.location} onChangeText={v => setF("location", v)} />
        <Field label="Summary" value={form.summary} onChangeText={v => setF("summary", v)} multiline />
        <Field label="Experience" value={form.experience} onChangeText={v => setF("experience", v)} multiline />
        <Field label="Education" value={form.education} onChangeText={v => setF("education", v)} multiline />
        <Field label="Skills" value={form.skills} onChangeText={v => setF("skills", v)} multiline />
        <Button title="Generate CV" onPress={() => generate("cv", { ...form, email })} />
      </ToolWrap>
    );
  }

  if (screen === "cover") {
    return (
      <ToolWrap title="Cover Letter" back={() => setScreen("home")}>
        <Field label="Full Name" value={form.fullName} onChangeText={v => setF("fullName", v)} />
        <Field label="Job Title" value={form.jobTitle} onChangeText={v => setF("jobTitle", v)} />
        <Field label="Company" value={form.company} onChangeText={v => setF("company", v)} />
        <Field label="Why are you a good fit?" value={form.reason} onChangeText={v => setF("reason", v)} multiline />
        <Field label="Experience" value={form.experience} onChangeText={v => setF("experience", v)} multiline />
        <Button title="Generate Cover Letter" onPress={() => generate("cover_letter", form)} />
      </ToolWrap>
    );
  }

  if (screen === "contract") {
    return (
      <ToolWrap title="Contract Generator" back={() => setScreen("home")}>
        <Field label="Provider" value={form.provider} onChangeText={v => setF("provider", v)} />
        <Field label="Client" value={form.client} onChangeText={v => setF("client", v)} />
        <Field label="Service" value={form.service} onChangeText={v => setF("service", v)} multiline />
        <Field label="Price" value={form.price} onChangeText={v => setF("price", v)} />
        <Field label="Payment Terms" value={form.paymentTerms} onChangeText={v => setF("paymentTerms", v)} multiline />
        <Button title="Generate Contract" onPress={() => generate("contract", form)} />
      </ToolWrap>
    );
  }

  if (screen === "output") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.inner}>
          <Text style={styles.title}>Generated Document</Text>
          <Text style={styles.output}>{output}</Text>
          <Button title="Copy Text" onPress={async () => {
            await Clipboard.setStringAsync(output);
            Alert.alert("Copied", "Document copied to clipboard");
          }} />
          <Button title="Back Home" onPress={() => setScreen("home")} secondary />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "docs") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.inner}>
          <Text style={styles.title}>My Documents</Text>
          {docs.map(d => (
            <TouchableOpacity key={d.id} style={styles.card} onPress={() => {
              setOutput(d.content);
              setScreen("output");
            }}>
              <Text style={styles.docTitle}>{d.title || d.tool}</Text>
              <Text>{new Date(d.created_at).toLocaleString()}</Text>
            </TouchableOpacity>
          ))}
          <Button title="Back Home" onPress={() => setScreen("home")} secondary />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

function ToolWrap({ title, back, children }) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>{title}</Text>
        {children}
        <Button title="Back" onPress={back} secondary />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#120606" },
  inner: { padding: 18 },
  title: { color: "#fff", fontSize: 34, fontWeight: "bold", marginBottom: 8 },
  subtitle: { color: "#ddd", fontSize: 16, marginBottom: 22 },
  section: { color: "#fff", fontSize: 22, fontWeight: "bold", marginTop: 20, marginBottom: 8 },
  label: { color: "#fff", marginBottom: 4, fontWeight: "600" },
  input: { backgroundColor: "#fff", color: "#000", padding: 12, borderRadius: 10 },
  button: { backgroundColor: "#ff3b3b", padding: 14, borderRadius: 12, marginVertical: 6 },
  secondaryButton: { backgroundColor: "#4b1c1c" },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  card: { backgroundColor: "#2b1111", color: "#fff", padding: 14, borderRadius: 12, marginVertical: 8 },
  output: { backgroundColor: "#fff", color: "#000", padding: 14, borderRadius: 12, lineHeight: 22 },
  docTitle: { color: "#fff", fontWeight: "bold", fontSize: 16, marginBottom: 4 }
});
