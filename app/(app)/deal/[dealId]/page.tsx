// app/(app)/deal/[dealId]/page.tsx — Deal detail: all fields inline-editable, edit history.
// See CLAUDE.md section 8.5.
// TODO: implement in Session 3

export default function DealDetailPage({ params }: { params: { dealId: string } }) {
  return (
    <div className="p-8">
      <p className="text-muted-foreground">Deal {params.dealId} — Session 3</p>
    </div>
  );
}
