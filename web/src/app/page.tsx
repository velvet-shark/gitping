"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { GitBranch, Bell, Zap, Shield, Github, User } from "lucide-react";

interface User {
  id: string;
  name: string;
  github_username: string;
  avatar_url: string;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) {
          setLoading(false);
          return;
        }

        const savedUser = localStorage.getItem("user");
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      } catch (error) {
        console.error("Error checking auth:", error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);
  return (
    <div className="min-h-screen bg-brutal-yellow-soft">
      {/* Header */}
      <header className="bg-white brutal-border-thick brutal-shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <Image
                src="/gitping-logo.png"
                alt="GitPing Logo"
                width={40}
                height={40}
                className="h-10 w-10 rounded-lg brutal-border brutal-shadow"
              />
              <span className="text-2xl font-bold text-black">GitPing</span>
            </div>
            <div className="flex items-center space-x-3">
              {loading ? (
                <div className="animate-pulse bg-gray-300 h-10 w-20 brutal-border"></div>
              ) : user ? (
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-2 bg-brutal-green text-black brutal-button"
                >
                  <User className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              ) : (
                <Link href="/auth/login" className="bg-brutal-green text-black brutal-button">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text */}
          <div className="space-y-8">
            <div className="white brutal-card p-8">
              <h1 className="brutal-text-xl mb-6 text-black text-brutal-shadow-colored">
                Never miss a <span className="bg-brutal-green px-3 py-1 brutal-border">release</span>
              </h1>
              <p className="text-xl text-gray-700 mb-8 leading-relaxed">
                Get instant notifications when your favorite GitHub repositories release new versions. Stay updated on
                the tools and libraries you depend on.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-center">
              <Link
                href="/auth/login"
                className="bg-brutal-green text-black brutal-button flex items-center space-x-3 text-lg brutal-wiggle"
              >
                <Github className="h-5 w-5" />
                <span>Sign up for free</span>
              </Link>
              <div className="text-gray-600">
                <p className="text-sm">Free forever • No credit card required</p>
              </div>
            </div>
          </div>

          {/* Right Column - Dashboard Preview */}
          <div className="relative">
            <div className="bg-brutal-purple brutal-card p-8 text-center brutal-float">
              <div className="bg-white brutal-border-thick p-4 mb-4">
                <Image
                  src="/gitping-dashboard.png"
                  alt="GitPing Dashboard Preview"
                  width={600}
                  height={400}
                  className="w-full h-auto rounded-lg"
                />
              </div>
              <p className="text-sm font-medium text-gray-700">Your dashboard for managing notifications</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-brutal-blue brutal-card brutal-pulse">
            <div className="bg-brutal-yellow-soft brutal-border w-16 h-16 flex items-center justify-center mb-4 brutal-shadow">
              <Bell className="h-8 w-8 text-black" />
            </div>
            <h3 className="text-lg font-bold text-black mb-3">Real-time notifications</h3>
            <p className="text-black text-sm leading-relaxed">
              Get notified instantly via Telegram when new releases are published. No delays, no missed updates.
            </p>
          </div>
          <div className="p-6 bg-brutal-purple brutal-card brutal-pulse">
            <div className="bg-brutal-yellow-soft brutal-border w-16 h-16 flex items-center justify-center mb-4 brutal-shadow">
              <Zap className="h-8 w-8 text-black" />
            </div>
            <h3 className="text-lg font-bold text-black mb-3">Simple and focused</h3>
            <p className="text-black text-sm leading-relaxed">
              Track releases from any public GitHub repository. Clean, straightforward notifications without the
              clutter.
            </p>
          </div>
          <div className="p-6 bg-brutal-orange brutal-card brutal-pulse">
            <div className="bg-brutal-yellow-soft brutal-border w-16 h-16 flex items-center justify-center mb-4 brutal-shadow">
              <Shield className="h-8 w-8 text-black" />
            </div>
            <h3 className="text-lg font-bold text-black mb-3">Secure & private</h3>
            <p className="text-black text-sm leading-relaxed">
              Built on Cloudflare's global network. We never store your GitHub tokens, and you control your data.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-24 white brutal-card p-8">
          <h2 className="text-2xl font-bold text-center text-black mb-12 text-brutal-shadow-blue">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-brutal-green brutal-border-thick w-16 h-16 flex items-center justify-center mx-auto mb-4 brutal-shadow brutal-bounce">
                <span className="text-2xl font-bold text-black">1</span>
              </div>
              <h3 className="text-lg font-bold mb-2 text-black">Connect GitHub</h3>
              <p className="text-gray-700 text-sm">Sign in with your GitHub account to access public repositories</p>
            </div>
            <div className="text-center">
              <div
                className="bg-brutal-pink brutal-border-thick w-16 h-16 flex items-center justify-center mx-auto mb-4 brutal-shadow brutal-bounce"
                style={{ animationDelay: "0.5s" }}
              >
                <span className="text-2xl font-bold text-black">2</span>
              </div>
              <h3 className="text-lg font-bold mb-2 text-black">Subscribe to repos</h3>
              <p className="text-gray-700 text-sm">Add repositories you want to track and connect your Telegram</p>
            </div>
            <div className="text-center">
              <div
                className="bg-brutal-blue brutal-border-thick w-16 h-16 flex items-center justify-center mx-auto mb-4 brutal-shadow brutal-bounce"
                style={{ animationDelay: "1s" }}
              >
                <span className="text-2xl font-bold text-black">3</span>
              </div>
              <h3 className="text-lg font-bold mb-2 text-black">Get notified</h3>
              <p className="text-gray-700 text-sm">
                Receive instant Telegram notifications when new releases are published
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-24 text-center bg-brutal-pink brutal-card p-12">
          <h2 className="text-3xl font-bold text-black mb-6 text-brutal-shadow-green">Ready to get started?</h2>
          <p className="text-xl text-gray-700 mb-8">Join developers who never miss important releases</p>
          <Link
            href="/auth/login"
            className="bg-brutal-green text-black brutal-button inline-flex items-center space-x-3 text-lg brutal-wiggle"
          >
            <Github className="h-5 w-5" />
            <span>Sign up for free</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-black brutal-border-thick mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/gitping-logo.png"
                alt="GitPing Logo"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg brutal-border bg-white"
              />
              <span className="text-xl font-bold text-white">GitPing</span>
            </div>
            <a
              href="https://velvetshark.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white hover:underline flex items-center"
            >
              <svg
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                height="22"
                width="22"
                className="mr-2"
                style={{ marginRight: "0.5rem" }}
              >
                <path
                  fill="currentColor"
                  d="M22 16v2h-2c-1.4 0-2.8-.4-4-1c-2.5 1.3-5.5 1.3-8 0c-1.2.6-2.6 1-4 1H2v-2h2c1.4 0 2.8-.5 4-1.3c2.4 1.7 5.6 1.7 8 0c1.2.8 2.6 1.3 4 1.3zM5.28 13.79c.54-.16 1.09-.41 1.61-.75L8 12.28c.69-2.28.78-5.01-.41-8.14c4.36.75 8.3 4.51 9.78 9.05c.75.45 1.54.72 2.29.78C18.24 7.4 12.37 2 6 2c-.35 0-.67.18-.85.47c-.18.3-.2.67-.04.98c2.17 4.34 1.5 7.84.17 10.34M16 18.7c-2.4 1.7-5.6 1.7-8 0c-1.2.8-2.6 1.3-4 1.3H2v2h2c1.4 0 2.8-.4 4-1c2.5 1.3 5.5 1.3 8 0c1.2.6 2.6 1 4 1h2v-2h-2c-1.4 0-2.8-.5-4-1.3"
                ></path>
              </svg>
              By VelvetShark.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
