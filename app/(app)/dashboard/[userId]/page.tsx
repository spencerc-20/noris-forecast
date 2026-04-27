// app/(app)/dashboard/[userId]/page.tsx — Manager view of a specific rep's dashboard.
// Requires canViewRep() permission check. Same layout as /dashboard but for a different rep.
// TODO: implement in Session 7

export default function RepDashboardPage({ params }: { params: { userId: string } }) {
  return (
    <div className="p-8">
      <p className="text-muted-foreground">Rep {params.userId} Dashboard — Session 7</p>
    </div>
  );
}
