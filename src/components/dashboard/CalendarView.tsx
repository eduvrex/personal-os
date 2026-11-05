"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DatesSetArg,
  DateSelectArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";

interface Props {
  events: EventInput[];
  onDatesSet: (fromStr: string, toStr: string) => void;
  onSelect: (arg: DateSelectArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onEventDrop: (arg: EventDropArg) => void;
}

/** FullCalendar wrapper (client-only; loaded via next/dynamic ssr:false). */
export default function CalendarView({
  events,
  onDatesSet,
  onSelect,
  onEventClick,
  onEventDrop,
}: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,listMonth,listYear",
      }}
      buttonText={{ today: "Today", week: "Week" }}
      views={{
        dayGridMonth: { buttonText: "Month" },
        // The big picture: every deadline in the next 12 months on one list —
        // built for scanning master's application deadlines at a glance.
        listYear: { buttonText: "Year", listDayFormat: { month: "long", day: "numeric", weekday: "short" } },
        listMonth: { buttonText: "Agenda" },
      }}
      height="auto"
      selectable
      selectMirror
      editable
      dayMaxEvents={3}
      nowIndicator
      events={events}
      datesSet={(arg: DatesSetArg) => onDatesSet(arg.startStr, arg.endStr)}
      select={onSelect}
      eventClick={onEventClick}
      eventDrop={onEventDrop}
      eventResize={(arg) => onEventDrop(arg as unknown as EventDropArg)}
    />
  );
}
