import RegisterTab from "./components/RegisterTab";
import RecognitionTab from "./components/RecognitionTab";
import "./index.css";
import { useState } from "react";

const TABS = [
  { label: "Register", value: "register" },
  { label: "Recognition", value: "recognition" },
];

function App() {
  const [tab, setTab] = useState<"register" | "recognition">("register");

  return (
    <div className="w-full min-h-screen bg-light-purple flex flex-col">
      <header className="w-full py-8 flex-center flex-col bg-light-purple">
        <h1 className="text-4xl font-bold text-dark-purple mb-2">
          Face Recognition Demo
        </h1>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.value}
              className={"tab-btn" + (tab === t.value ? " active" : "")}
              onClick={() => setTab(t.value as "register" | "recognition")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <main className="flex-1 w-full flex-center sm:flex-col">
        <section className="tab-content w-full mx-auto sm:ml-3 sm:mr-3">
          {tab === "register" ? <RegisterTab /> : <RecognitionTab />}
        </section>
      </main>
      <footer className="w-full py-4 bg-light-purple flex-center flex-col border-t border-purple-100 mt-4">
        <div className="text-sm text-purple font-semibold">
          Demo made by{" "}
          <a
            href="https://github.com/sondoannam"
            target="_blank"
            rel="noopener noreferrer"
          >
            <b>Son Doan Nam</b>
          </a>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          &copy; 2025. For academic demonstration only.
        </div>
      </footer>
    </div>
  );
}

export default App;
