# inbox

The drop folder. Put a file here and ask a Claude session to process it, rather than wiring up
another API connector — this is the deliberate low-friction path into the OS.

- `syllabi/` — course syllabus PDFs. These become course entities and calendar events
  (`src/lib/courses.ts`, `src/lib/canvas.ts`); the seeded semester schedule they produce is what
  SchoolBoard's Runway renders.

Files here are inputs, not state. Once something has been ingested into Supabase, the copy in
this folder is only a record of where it came from.
