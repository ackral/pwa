function StatusCard({ isOnline }) {
  return (
    <section className="card">
      <h2>Status</h2>
      <p
        className={`status-text ${isOnline ? "status-online" : "status-offline"}`}
      >
        {isOnline ? "Verbindung: Online ✓" : "Verbindung: Offline ✗"}
      </p>
    </section>
  );
}

export default StatusCard;
