import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Card, DataTable, Badge, Button, Pagination, TextField, Select, Toast, Frame, Text, BlockStack, InlineStack, Box } from "@shopify/polaris";

const STATUS_TONES = { pending: "attention", responded: "info", accepted: "success", declined: undefined, converted: "success", expired: "critical" };

export default function Quotes() {
  const nav = useNavigate();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const [quotes, setQuotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const fetchQuotes = useCallback(async () => {
    const params = new URLSearchParams({ shop, page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/quotes?${params}`);
    const data = await res.json();
    setQuotes(data.quotes || []); setTotal(data.total || 0);
  }, [shop, page, statusFilter, search]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  const handleDelete = async (id) => {
    await fetch(`/api/quotes/${id}?shop=${shop}`, { method: "DELETE" });
    setToast("Quote deleted"); fetchQuotes();
  };

  const rows = quotes.map(q => [
    q.reference,
    `${q.firstName} ${q.lastName}`,
    q.company || "—",
    <Badge key="s" tone={STATUS_TONES[q.status]}>{q.status}</Badge>,
    new Date(q.createdAt).toLocaleDateString("en-GB"),
    <InlineStack gap="100" key={q.id}>
      <Button size="slim" onClick={() => nav(`/quotes/${q.id}?shop=${shop}`)}>View</Button>
      <Button size="slim" tone="critical" onClick={() => handleDelete(q.id)}>Delete</Button>
    </InlineStack>,
  ]);

  return (
    <Frame>
      <Page title="Quotes" backAction={{ content: "Dashboard", onAction: () => nav(`/?shop=${shop}`) }}>
        <Card><BlockStack gap="400">
          <InlineStack gap="300">
            <Box minWidth="200px"><TextField label="Search" value={search} onChange={setSearch} placeholder="Name, email, reference..." autoComplete="off" clearButton onClearButtonClick={() => setSearch("")} /></Box>
            <Box minWidth="150px"><Select label="Status" options={[{ label: "All", value: "" }, { label: "Pending", value: "pending" }, { label: "Responded", value: "responded" }, { label: "Accepted", value: "accepted" }, { label: "Converted", value: "converted" }, { label: "Declined", value: "declined" }]} value={statusFilter} onChange={setStatusFilter} /></Box>
          </InlineStack>
          <DataTable columnContentTypes={["text", "text", "text", "text", "text", "text"]} headings={["Ref", "Customer", "Company", "Status", "Date", "Actions"]} rows={rows} />
          <InlineStack align="center"><Pagination hasPrevious={page > 1} hasNext={page * 20 < total} onPrevious={() => setPage(page - 1)} onNext={() => setPage(page + 1)} /></InlineStack>
        </BlockStack></Card>
        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
