"use client";

import { useEffect, useState, Suspense } from "react";
import { Github, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

function LoginPageContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check for error parameter from OAuth callback
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  const handleGitHubLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";
      const response = await fetch(`${apiUrl}/auth/github`);

      if (!response.ok) {
        throw new Error("Failed to initiate login");
      }

      const data = await response.json();

      // Redirect to GitHub OAuth
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brutal-pink flex flex-col">
      {/* Header */}
      <header className="bg-white brutal-border-thick brutal-shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link href="/" className="flex items-center space-x-2 text-black hover:text-gray-700 font-medium brutal-wiggle">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white brutal-card p-10 brutal-float">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <Image
                src="/gitping-logo.png"
                alt="GitPing Logo"
                width={64}
                height={64}
                className="h-16 w-16 rounded-lg brutal-border brutal-shadow brutal-bounce"
              />
            </div>
            <h1 className="text-2xl font-bold text-black mb-4">Sign in to GitPing</h1>
            <p className="text-gray-700 text-sm">Connect your GitHub account to start tracking releases</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500 brutal-border brutal-shadow">
              <p className="text-sm text-white font-bold">{error}</p>
            </div>
          )}

          <button
            onClick={handleGitHubLogin}
            disabled={loading}
            className={`
              w-full flex items-center justify-center space-x-3 bg-black text-white brutal-button ${!loading ? 'brutal-pulse' : ''}
              ${loading ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <Github className="h-5 w-5" />
            <span>{loading ? "Connecting..." : "Sign in with GitHub"}</span>
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-600">GitPing only accesses public repository information</p>
          </div>

          <div className="mt-8 bg-brutal-yellow-soft p-4 brutal-border brutal-shadow">
            <h3 className="text-sm font-bold text-black mb-4">What you'll get:</h3>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-black mt-2 flex-shrink-0"></div>
                <span>Subscribe to any public repository</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-black mt-2 flex-shrink-0"></div>
                <span>Real-time release notifications</span>
              </li>
              <li className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-black mt-2 flex-shrink-0"></div>
                <span>Dashboard to manage subscriptions</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
