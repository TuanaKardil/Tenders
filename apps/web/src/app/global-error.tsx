"use client";

// Top-level fallback for errors thrown outside the locale layout. Must render
// its own <html>/<body> and cannot use i18n context, so text is English-only.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "0.875rem" }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            borderRadius: "0.5rem",
            background: "#111827",
            color: "#fff",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
