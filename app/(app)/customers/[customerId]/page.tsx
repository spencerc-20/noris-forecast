// app/(app)/customers/[customerId]/page.tsx — Customer detail: three-badge header, sales context, annual revenue chart, deals.
// See CLAUDE.md section 8.6.
// TODO: implement in Session 5

export default function CustomerDetailPage({ params }: { params: { customerId: string } }) {
  return (
    <div className="p-8">
      <p className="text-muted-foreground">Customer {params.customerId} — Session 5</p>
    </div>
  );
}
