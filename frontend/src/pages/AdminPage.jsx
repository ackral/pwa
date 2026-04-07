import { Link } from "react-router-dom";
import AdminSendMessage from "../components/AdminSendMessage";
import AdminMessageOverview from "../components/AdminMessageOverview";
import UserManagement from "../components/UserManagement";
import EmployeeInfo from "../components/EmployeeInfo";
import DocumentUpload from "../components/DocumentUpload";

function AdminPage() {
  return (
    <>
      <header>
        <h1>Admin-Bereich</h1>
        <p className="subtitle">Nachrichten, Benutzer & Dokumente</p>
      </header>
      <main>
        <nav className="admin-nav">
          <Link to="/" className="back-link">
            ← Zurück zur App
          </Link>
          <Link
            to="/settings"
            className="back-link"
            style={{ marginLeft: "auto" }}
          >
            ⚙️ Einstellungen
          </Link>
        </nav>
        <AdminSendMessage />
        <AdminMessageOverview />
        <EmployeeInfo />
        <UserManagement />
        <DocumentUpload />
      </main>
    </>
  );
}

export default AdminPage;
