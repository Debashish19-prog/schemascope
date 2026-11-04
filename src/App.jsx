import { useEffect, useState } from "react";
import { api } from "./api";
import ConnectScreen from "./components/ConnectScreen";
import Workspace from "./components/Workspace";

export default function App() {
  const [info, setInfo] = useState(undefined); // undefined = still checking
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api
      .session()
      .then((d) => setInfo(d.info))
      .catch(() => setInfo(null));
  }, []);

  if (info === undefined) return <div className="boot">Loading…</div>;
  if (!info) {
    return (
      <ConnectScreen
        notice={notice}
        onConnected={(next) => {
          setNotice("");
          setInfo(next);
        }}
      />
    );
  }
  return (
    <Workspace
      onDisconnected={(message = "") => {
        setNotice(message);
        setInfo(null);
      }}
    />
  );
}
