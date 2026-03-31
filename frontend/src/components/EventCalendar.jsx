import { useState, useMemo } from "react";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function EventCalendar({ events }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Adjust to Monday-start week (0=Mon, 6=Sun)
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const days = [];

    // Empty cells before month start
    for (let i = 0; i < startWeekday; i++) {
      days.push({ day: null, key: `empty-${i}` });
    }

    // Actual days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ day: d, key: `day-${d}` });
    }

    return days;
  }, [year, month]);

  // Map events to days
  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((evt) => {
      const dateStr = evt.eventDate || evt.createdAt;
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(evt);
      }
    });
    return map;
  }, [events, year, month]);

  const today = new Date();
  const isToday = (day) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // Events for the selected month, sorted
  const monthEvents = useMemo(() => {
    return events
      .filter((e) => {
        const dateStr = e.eventDate || e.createdAt;
        const d = new Date(dateStr);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort(
        (a, b) =>
          new Date(a.eventDate || a.createdAt) -
          new Date(b.eventDate || b.createdAt),
      );
  }, [events, year, month]);

  return (
    <div className="calendar-container">
      <div className="calendar-nav">
        <button className="cal-nav-btn" onClick={prevMonth}>
          ‹
        </button>
        <span className="cal-month-label">
          {MONTH_NAMES[month]} {year}
        </span>
        <button className="cal-nav-btn" onClick={nextMonth}>
          ›
        </button>
        <button className="cal-today-btn" onClick={goToday}>
          Heute
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="cal-weekday">
            {wd}
          </div>
        ))}
        {calendarDays.map(({ day, key }) => (
          <div
            key={key}
            className={
              "cal-day" +
              (day === null ? " cal-day-empty" : "") +
              (isToday(day) ? " cal-day-today" : "") +
              (eventsByDay[day] ? " cal-day-has-event" : "")
            }
          >
            {day !== null && (
              <>
                <span className="cal-day-number">{day}</span>
                {eventsByDay[day] && (
                  <span
                    className="cal-event-dot"
                    title={eventsByDay[day].map((e) => e.title).join(", ")}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {monthEvents.length > 0 && (
        <div className="cal-event-list">
          <h3>Events in {MONTH_NAMES[month]}</h3>
          {monthEvents.map((evt) => {
            const d = new Date(evt.eventDate || evt.createdAt);
            const dateStr = d.toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
            });
            return (
              <div key={evt.id} className="cal-event-item">
                <span className="cal-event-date">{dateStr}</span>
                <div>
                  <strong>{evt.title}</strong>
                  <p className="cal-event-body">{evt.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {monthEvents.length === 0 && (
        <div className="empty-state" style={{ marginTop: "0.75rem" }}>
          <span className="empty-icon">📅</span>
          <p>Keine Events in {MONTH_NAMES[month]}</p>
        </div>
      )}
    </div>
  );
}

export default EventCalendar;
