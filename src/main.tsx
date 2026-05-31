import { StrictMode, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy, getAccessToken } from "@privy-io/react-auth";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Hook que adapta Privy al contrato de ConvexProviderWithAuth.
// Debe retornar referencias estables (useCallback/useMemo) para evitar loops.
function usePrivyConvexAuth() {
  const { ready, authenticated, getAccessToken: getPrivyAccessToken } = usePrivy();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken: _force }: { forceRefreshToken: boolean }) => {
      try {
        // getAccessToken del hook usePrivy ofrece la opción de refresh
        const token = await (getPrivyAccessToken
          ? getPrivyAccessToken()
          : getAccessToken());
        console.log("[Convex Auth] fetchAccessToken →", token ? "GOT TOKEN" : "NULL");
        return token ?? null;
      } catch (err) {
        console.error("[Convex Auth] fetchAccessToken error", err);
        return null;
      }
    },
    [getPrivyAccessToken]
  );

  return useMemo(
    () => ({
      isLoading: !ready,
      isAuthenticated: ready && authenticated,
      fetchAccessToken,
    }),
    [ready, authenticated, fetchAccessToken]
  );
}

function ConvexWithPrivy({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={usePrivyConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID as string}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "light",
          accentColor: "#2351D8", // Royal Azure
          logo: undefined,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
        },
      }}
    >
      <ConvexWithPrivy>
        <App />
      </ConvexWithPrivy>
    </PrivyProvider>
  </StrictMode>
);
