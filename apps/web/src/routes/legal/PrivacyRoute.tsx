/**
 * Placeholder Privacy Policy. Real legal drafting is explicitly out of scope
 * for the PoC (REQUIREMENTS.md §5.4, §11 A-5) — this stands in so the consent
 * checkbox (FR-006) has something real to link to.
 */
export function PrivacyRoute() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">
        Politique de confidentialité / Privacy Policy
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Version de test — texte juridique définitif à venir. / Placeholder — final legal text to
        follow.
      </p>
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Français</h2>
        <p>
          Les données personnelles (nom affiché, e-mail pour les comptes, réponses et scores) sont
          hébergées dans l&apos;Union européenne et ne sont utilisées que pour faire fonctionner
          l&apos;événement. Aucune donnée n&apos;est vendue ni partagée avec des tiers.
        </p>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">English</h2>
        <p>
          Personal data (display name, email for accounts, answers and scores) is hosted in the
          European Union and used only to run the event. No data is sold or shared with third
          parties.
        </p>
      </section>
    </main>
  );
}
