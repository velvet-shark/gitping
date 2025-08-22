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
            <h3 className="text-lg font-bold text-black mb-3">Smart filters</h3>
            <p className="text-black text-sm leading-relaxed">
              Control what you want to hear about. Skip pre-releases, filter by version patterns, customize your
              preferences.
            </p>
          </div>
          <div className="p-6 bg-brutal-orange brutal-card brutal-pulse">
            <div className="bg-brutal-yellow-soft brutal-border w-16 h-16 flex items-center justify-center mb-4 brutal-shadow">
              <Shield className="h-8 w-8 text-black" />
            </div>
            <h3 className="text-lg font-bold text-black mb-3">Secure & private</h3>
            <p className="text-black text-sm leading-relaxed">
              Built on Cloudflare's global network. Your data is encrypted, and we never store your GitHub tokens.
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
              <p className="text-gray-700 text-sm">
                Add repositories you want to track and configure your notification preferences
              </p>
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
              className="text-sm text-white hover:underline"
            >
              By VelvetShark.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
