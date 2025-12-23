import "@/styles/globals.css";
import { AuthProvider } from '../context/auth';
import { AlertProvider } from '../context/AlertContext';

export default function App({ Component, pageProps }) {
  return (
    <AlertProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </AlertProvider>
  );
}
