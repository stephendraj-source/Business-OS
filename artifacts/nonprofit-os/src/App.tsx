import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { PublicFormPage } from "@/pages/public-form";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/components/login-page";
import { TenantManagementPage } from "@/components/tenant-management-page";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  const { currentUser, isLoading, isSuperUser } = useAuth();
  const [location] = useLocation();

  // Public routes — accessible without login
  if (location.startsWith('/f/')) {
    return (
      <Switch>
        <Route path="/f/:slug" component={PublicFormPage} />
      </Switch>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  if (isSuperUser) {
    return <TenantManagementPage />;
  }

  return (
    <TooltipProvider>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </TooltipProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
