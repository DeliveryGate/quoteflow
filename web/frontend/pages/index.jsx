import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Layout, Card, Banner, Button, Text, BlockStack, InlineStack, Badge, DataTable, ProgressBar, Spinner, Box } from "@shopify/polaris";

export default function Dashboard() {
  const nav = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [quotes, setQuotes] = useState([]);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/quotes?shop=${shop}`).then(r => r.json()),
      fetch(`/api/billing/status?shop=${shop}`).then(r => r.json()),
    ]).then(([q, b]) => { setQuotes(q.quotes || []); setBilling(b); }).finally(() => setLoading(false));
  }, [shop]);

  if (loading) return <Page title="QuoteFlow"><Card><Box padding="800"><InlineStack align="center"><Spinner size="large" /></InlineStack></Box></Card></Page>;

  const today = new Date().toISOString().slice(0, 10);
  const newToday = quotes.filter(q => q.createdAt?.slice(0, 10) === today).length;
  const pending = quotes.filter(q => q.status === "pending").length;
  const converted = quotes.filter(q => q.status === "converted").length;
  const convRate = quotes.length > 0 ? Math.round((converted / quotes.length) * 100) : 0;
  const overdue = quotes.filter(q => q.status === "pending" && new Date(q.createdAt) < new Date(Date.now() - 86400000));
  const usagePct = billing?.quoteLimit === "unlimited" ? 0 : Math.round(((billing?.quoteCount || 0) / (billing?.quoteLimit || 10)) * 100);

  return (
    <Page title="QuoteFlow">
      <Layout>
        {overdue.length > 0 && <Layout.Section><Banner title={`${overdue.length} quotes waiting over 24 hours`} tone="warning" action={{ content: "View pending", onAction: () => nav(`/quotes?shop=${shop}`) }}>Respond promptly to increase conversion rates.</Banner></Layout.Section>}

        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm">New Today</Text><Text variant="headingXl">{newToday}</Text></BlockStack></Card></Layout.Section>
        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm">Pending Response</Text><Text variant="headingXl">{pending}</Text></BlockStack></Card></Layout.Section>
        <Layout.Section variant="oneThird"><Card><BlockStack gap="200"><Text variant="headingSm">Conversion Rate</Text><Text variant="headingXl">{convRate}%</Text><Text variant="bodySm" tone="subdued">{converted} of {quotes.length} converted</Text></BlockStack></Card></Layout.Section>

        <Layout.Section><Card><BlockStack gap="300"><Text variant="headingMd">Monthly Usage</Text><ProgressBar progress={usagePct} size="small" /><Text variant="bodySm">{billing?.quoteCount || 0} / {billing?.quoteLimit || 10} quotes this month</Text></BlockStack></Card></Layout.Section>

        <Layout.Section><Card><BlockStack gap="300"><Text variant="headingMd">Recent Quotes</Text>
          {quotes.length === 0 ? <Text tone="subdued">No quotes yet. Add the Quote Button block to your theme to start receiving quote requests.</Text> :
            <DataTable columnContentTypes={["text", "text", "text", "text", "text"]} headings={["Ref", "Customer", "Status", "Date", "Action"]}
              rows={quotes.slice(0, 10).map(q => [q.reference, `${q.firstName} ${q.lastName}`, q.status, new Date(q.createdAt).toLocaleDateString("en-GB"), <Button key={q.id} size="slim" onClick={() => nav(`/quotes/${q.id}?shop=${shop}`)}>View</Button>])} />}
        </BlockStack></Card></Layout.Section>

        <Layout.Section><InlineStack gap="300"><Button onClick={() => nav(`/quotes?shop=${shop}`)}>All quotes</Button><Button onClick={() => nav(`/settings?shop=${shop}`)}>Settings</Button></InlineStack></Layout.Section>
      </Layout>
    </Page>
  );
}
