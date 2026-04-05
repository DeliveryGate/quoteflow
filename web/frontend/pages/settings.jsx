import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Layout, Card, TextField, Select, Button, Badge, Toast, Frame, Text, BlockStack, InlineStack, Checkbox, Box } from "@shopify/polaris";

const PLANS = { free: { name: "Free", price: 0, limit: 10, features: ["10 quotes/month", "Basic notifications"] }, starter: { name: "Starter", price: 14.99, limit: "Unlimited", features: ["Unlimited quotes", "Email notifications", "CSV export", "Auto-reply"] }, pro: { name: "Pro", price: 24.99, limit: "Unlimited", features: ["Unlimited quotes", "PDF quotes", "Custom branding", "Draft order conversion"] } };

export default function Settings() {
  const nav = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [settings, setSettings] = useState(null);
  const [billing, setBilling] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    Promise.all([fetch(`/api/settings?shop=${shop}`).then(r => r.json()), fetch(`/api/billing/status?shop=${shop}`).then(r => r.json())]).then(([s, b]) => { setSettings(s); setBilling(b); });
  }, [shop]);

  const update = (key, value) => setSettings({ ...settings, [key]: value });

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/settings?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setSaving(false); setToast("Settings saved");
  };

  const handleSubscribe = async (plan) => {
    setSubscribing(plan);
    const res = await fetch(`/api/billing/subscribe?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    const d = await res.json(); setSubscribing(null);
    if (d.confirmationUrl) window.top.location.href = d.confirmationUrl;
  };

  if (!settings) return <Page title="Settings"><Card><Text>Loading...</Text></Card></Page>;

  return (
    <Frame>
      <Page title="Settings" backAction={{ content: "Dashboard", onAction: () => nav(`/?shop=${shop}`) }}>
        <Layout>
          <Layout.Section><Card><BlockStack gap="400">
            <Text variant="headingMd">Notifications</Text>
            <Checkbox label="Email notifications on new quotes" checked={settings.notificationsEnabled} onChange={v => update("notificationsEnabled", v)} />
          </BlockStack></Card></Layout.Section>

          <Layout.Section><Card><BlockStack gap="400">
            <Text variant="headingMd">Auto-Reply</Text>
            <Checkbox label="Send auto-reply to customers" checked={settings.autoReplyEnabled} onChange={v => update("autoReplyEnabled", v)} />
            <TextField label="Auto-reply message" value={settings.autoReplyMessage || ""} onChange={v => update("autoReplyMessage", v)} multiline={3} autoComplete="off" placeholder="Thank you for your quote request. We'll respond within..." />
            <Select label="Response time promise" options={[{ label: "4 hours", value: "4" }, { label: "12 hours", value: "12" }, { label: "24 hours", value: "24" }, { label: "48 hours", value: "48" }]} value={String(settings.responseTimeHours)} onChange={v => update("responseTimeHours", parseInt(v))} />
          </BlockStack></Card></Layout.Section>

          <Layout.Section><Card><BlockStack gap="400">
            <Text variant="headingMd">Form Fields</Text>
            <Checkbox label="Require company name" checked={settings.requireCompany} onChange={v => update("requireCompany", v)} />
            <Checkbox label="Require phone number" checked={settings.requirePhone} onChange={v => update("requirePhone", v)} />
            <Checkbox label="Show target budget field" checked={settings.showBudgetField} onChange={v => update("showBudgetField", v)} />
            <TextField label="Custom terms" value={settings.customTerms || ""} onChange={v => update("customTerms", v)} multiline={3} autoComplete="off" />
          </BlockStack></Card></Layout.Section>

          <Layout.Section><Button variant="primary" loading={saving} onClick={handleSave}>Save settings</Button></Layout.Section>

          <Layout.Section><Text variant="headingMd">Plans</Text></Layout.Section>
          {Object.entries(PLANS).map(([key, plan]) => (
            <Layout.Section variant="oneThird" key={key}><Card><BlockStack gap="300">
              <InlineStack gap="200"><Text variant="headingMd">{plan.name}</Text>{key === billing?.plan && <Badge tone="success">Current</Badge>}</InlineStack>
              <Text variant="headingXl">{plan.price === 0 ? "Free" : `$${plan.price}/mo`}</Text>
              {plan.features.map(f => <Text key={f} variant="bodySm">{f}</Text>)}
              {key !== "free" && key !== billing?.plan && <Button variant="primary" loading={subscribing === key} onClick={() => handleSubscribe(key)}>Upgrade to {plan.name}</Button>}
            </BlockStack></Card></Layout.Section>
          ))}
        </Layout>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
