import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/shared/ui/toaster";
import { TooltipProvider } from "@/shared/ui/tooltip";
import Dashboard from "@/app/routes/dashboard";
import NotFound from "@/app/routes/not-found";
import { PublicFormPage } from "@/app/routes/public-form";
import { AuthProvider, useAuth } from "@/app/providers/AuthContext";
import { FavouritesProvider } from "@/app/providers/FavouritesContext";
import { LoginPage } from "@/features/auth/login-page";
import { TenantManagementPage } from "@/features/tenants/tenant-management-page";

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

  // Password reset link — render login page in reset mode
  if (location.startsWith('/reset-password')) {
    return <LoginPage />;
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
          <FavouritesProvider>
            <AppRoutes />
          </FavouritesProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
