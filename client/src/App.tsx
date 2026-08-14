import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { FootageSelectionProvider } from "./contexts/FootageSelectionContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import AskFootage from "./pages/AskFootage";
import Collections from "./pages/Collections";
import Documentation from "./pages/Documentation";
import Home from "./pages/Home";
import Library from "./pages/Library";
import MyLibrary from "./pages/MyLibrary";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/my-library" component={MyLibrary} />
      <Route path="/sample" component={Library} />
      <Route path="/library" component={Library} />
      <Route path="/collections" component={Collections} />
      <Route path="/ask" component={AskFootage} />
      <Route path="/docs" component={Documentation} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster theme="light" richColors position="bottom-right" />
          <FootageSelectionProvider><Router /></FootageSelectionProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
