"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle, XCircle, ArrowRight, Loader } from "lucide-react";

function CallbackContent() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get("token");
      const errorParam = searchParams.get("error");

      if (errorParam) {
        setStatus("error");
        setError(decodeURIComponent(errorParam));
        return;
      }

      if (!token) {
        setStatus("error");
        setError("No authentication token received");
        return;
      }

      try {
        // Store the token in localStorage
        localStorage.setItem("auth_token", decodeURIComponent(token));

        // Fetch user data with the token to verify it's valid
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";
        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${decodeURIComponent(token)}` }
        });

        if (!response.ok) {
          throw new Error("Invalid token");
        }

        const userData = await response.json();
        if (userData.success && userData.user) {
          localStorage.setItem("user", JSON.stringify(userData.user));
        }

        setStatus("success");

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
        // Clear any stored data on error
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-brutal-light flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white brutal-card p-10 text-center">
        <div className="flex justify-center mb-6">
          <Image src="/gitping-logo.png" alt="GitPing Logo" width={64} height={64} className="h-16 w-16 rounded-lg brutal-border brutal-shadow" />
        </div>
        {status === "loading" && (
          <>
            <div className="bg-brutal-yellow brutal-border w-16 h-16 mx-auto mb-6 flex items-center justify-center brutal-shadow">
              <Loader className="h-8 w-8 text-black animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-black mb-4">Completing sign in...</h1>
            <p className="text-gray-700 text-sm">Please wait while we set up your account</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="bg-brutal-green brutal-border w-16 h-16 mx-auto mb-6 flex items-center justify-center brutal-shadow">
              <CheckCircle className="h-8 w-8 text-black" />
            </div>
            <h1 className="text-xl font-bold text-black mb-4">Welcome to GitPing!</h1>
            <p className="text-gray-700 text-sm mb-6">Your account has been set up successfully. Redirecting to dashboard...</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center space-x-2 bg-brutal-green text-black brutal-button brutal-wiggle"
            >
              <span>Go to dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="bg-red-500 brutal-border w-16 h-16 mx-auto mb-6 flex items-center justify-center brutal-shadow">
              <XCircle className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-black mb-4">Authentication failed</h1>
            <p className="text-gray-700 text-sm mb-6">{error}</p>
            <div className="space-y-4">
              <Link
                href="/auth/login"
                className="block bg-red-500 text-white brutal-button w-full brutal-pulse"
              >
                Try again
              </Link>
              <Link href="/" className="block text-gray-700 hover:text-black text-sm">
                Back to home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-brutal-light flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full bg-white brutal-card p-10 text-center">
            <div className="bg-brutal-yellow brutal-border w-16 h-16 mx-auto mb-6 flex items-center justify-center brutal-shadow">
              <Loader className="h-8 w-8 text-black animate-spin" />
            </div>
            <p className="text-gray-700 text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
