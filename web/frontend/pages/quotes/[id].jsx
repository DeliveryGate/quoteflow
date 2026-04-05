import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Page, Layout, Card, TextField, Select, Button, Toast, Frame, Text, BlockStack, InlineStack, Badge, Divider, Spinner, Box, Banner } from "@shopify/polaris";

export default function QuoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quotedPrice, setQuotedPrice] = useState("");
  const [message, setMessage] = useState("");
  const [validDays, setValidDays] = useState("14");
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { fetch(`/api/quotes/${id}?shop=${shop}`).then(r => r.json()).then(q => { setQuote(q); setQuotedPrice(q.quotedPrice || ""); setMessage(q.quotedMessage || ""); }).finally(() => setLoading(false)); }, [id, shop]);

  const handleRespond = async () => {
    setSending(true);
    const res = await fetch(`/api/quotes/${id}/respond?shop=${shop}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotedPrice: parseFloat(quotedPrice), message, validDays: parseInt(validDays) }) });
    setSending(false);
    if (res.ok) { setToast("Quote sent to customer"); const updated = await res.json(); setQuote(updated); }
    else setToast("Failed to send");
  };

  const handleConvert = async () => {
    setConverting(true);
    const res = await fetch(`/api/quotes/${id}/convert?shop=${shop}`, { method: "POST" });
    setConverting(false);
    if (res.ok) { const data = await res.json(); setToast("Draft order created"); setQuote({ ...quote, status: "converted", draftOrderUrl: data.invoiceUrl }); }
    else { const d = await res.json(); setToast(d.error || "Failed"); }
  };

  if (loading) return <Page title="Quote"><Card><Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box></Card></Page>;
  if (!quote) return <Page title="Quote"><Banner tone="critical">Quote not found</Banner></Page>;

  let products = [];
  try { products = JSON.parse(quote.products); } catch {}

  return (
    <Frame>
      <Page title={`Quote ${quote.reference}`} backAction={{ content: "Quotes", onAction: () => nav(`/quotes?shop=${shop}`) }}>
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card><BlockStack gap="300">
              <InlineStack gap="200"><Text variant="headingMd">Customer</Text><Badge tone={quote.status === "pending" ? "attention" : quote.status === "converted" ? "success" : "info"}>{quote.status}</Badge></InlineStack>
              <Text>{quote.firstName} {quote.lastName}</Text>
              {quote.company && <Text tone="subdued">{quote.company}</Text>}
              <Text>{quote.email}</Text>
              {quote.phone && <Text>{quote.phone}</Text>}
              <Text variant="bodySm" tone="subdued">Submitted: {new Date(quote.createdAt).toLocaleString("en-GB")}</Text>
            </BlockStack></Card>

            <Card><BlockStack gap="300">
              <Text variant="headingMd">Products Requested</Text>
              {products.map((p, i) => <Text key={i}>{p.title || p.id} x {p.quantity || 1}</Text>)}
              {quote.quantity && <Text>Total quantity: {quote.quantity}</Text>}
              {quote.targetBudget && <Text>Target budget: {quote.targetBudget}</Text>}
              {quote.notes && <><Divider /><Text variant="bodySm">{quote.notes}</Text></>}
            </BlockStack></Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            {quote.status === "pending" && (
              <Card><BlockStack gap="400">
                <Text variant="headingMd">Send Quote</Text>
                <TextField label="Quoted price" type="number" prefix="£" value={quotedPrice} onChange={setQuotedPrice} autoComplete="off" />
                <TextField label="Message to customer" value={message} onChange={setMessage} multiline={4} autoComplete="off" />
                <Select label="Valid for" options={[{ label: "7 days", value: "7" }, { label: "14 days", value: "14" }, { label: "30 days", value: "30" }]} value={validDays} onChange={setValidDays} />
                <Button variant="primary" loading={sending} onClick={handleRespond} disabled={!quotedPrice}>Send Quote</Button>
              </BlockStack></Card>
            )}

            {quote.status === "responded" && (
              <Card><BlockStack gap="300">
                <Text variant="headingMd">Quote Sent</Text>
                <Text>Price: £{quote.quotedPrice}</Text>
                <Text variant="bodySm" tone="subdued">Valid until: {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("en-GB") : "—"}</Text>
                {quote.quotedMessage && <Text variant="bodySm">{quote.quotedMessage}</Text>}
                <Text variant="bodySm" tone="subdued">Sent: {quote.respondedAt ? new Date(quote.respondedAt).toLocaleString("en-GB") : "—"}</Text>
              </BlockStack></Card>
            )}

            {(quote.status === "responded" || quote.status === "accepted") && (
              <Card><BlockStack gap="300">
                <Text variant="headingMd">Convert to Order</Text>
                <Text variant="bodySm">Creates a Shopify Draft Order and sends an invoice to the customer.</Text>
                <Button variant="primary" loading={converting} onClick={handleConvert}>Convert to Draft Order</Button>
              </BlockStack></Card>
            )}

            {quote.status === "converted" && quote.draftOrderUrl && (
              <Card><BlockStack gap="300">
                <Banner tone="success" title="Order Created">Quote has been converted to a draft order.</Banner>
                <Button url={quote.draftOrderUrl} external>View Draft Order</Button>
              </BlockStack></Card>
            )}
          </Layout.Section>
        </Layout>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
