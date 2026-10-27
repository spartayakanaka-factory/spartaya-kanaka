export default function CatalogLoading() {
  return (
    <section className="page-content loading-view" aria-busy="true">
      <span className="loading-label" role="status">
        جار تحميل الكتالوج… / Loading catalog…
      </span>
      <div className="product-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="loading-card" key={index}>
            <div className="loading-image" />
            <div className="loading-line" />
            <div className="loading-line short" />
          </div>
        ))}
      </div>
    </section>
  );
}
