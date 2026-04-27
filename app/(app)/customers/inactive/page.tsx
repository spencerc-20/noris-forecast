// app/(app)/customers/inactive/page.tsx — Inactive customers: auto-flagged churned accounts.
// Sortable by last order year, historical revenue, days since last order, region/owner.
// Actions: "Re-engage" or "Declare lost". See CLAUDE.md section 8.4.
// TODO: implement in Session 9

export default function InactiveCustomersPage() {
  return (
    <div className="p-8">
      <p className="text-muted-foreground">Inactive Customers — Session 9</p>
    </div>
  );
}
