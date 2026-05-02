import { CalendarDashboard } from "../../components/calendar-dashboard";

export default function CalendarPage() {
  return (
    <div className="modulePage">
      <header className="moduleHeader">
        <div>
          <span className="eyebrow">Calendar</span>
          <h1>My calendar</h1>
        </div>
      </header>

      <CalendarDashboard />
    </div>
  );
}
