"use client";

import { useEffect, useState } from "react";
import { Bell, Plus, LogOut, MessageSquare, Copy, Trash2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import AddRepositoryModal from "../../components/AddRepositoryModal";
import { formatDate, formatDateTime, getRelativeTime, formatDateWithRelative } from "../../lib/dateUtils";

interface User {
  id: string;
  name: string;
  github_username: string;
  avatar_url: string;
  email?: string;
  tg_chat_id?: string;
}

interface VerifiedChannel {
  id: number;
  user_id: string;
  channel_type: string;
  channel_identifier: string;
  display_name?: string;
  verified_at: number;
  created_at: number;
}

interface Subscription {
  id: number;
  repo: string;
  kind: string;
  filters: any;
  channels: any[];
  created_at: number;
  last_release?: {
    tag_name: string;
    published_at: string;
    html_url: string;
  };
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [channels, setChannels] = useState<VerifiedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionCode, setConnectionCode] = useState("");
  const [showConnectionCode, setShowConnectionCode] = useState(false);
  const [showAddRepo, setShowAddRepo] = useState(false);

  // Helper function to check if Telegram is already connected
  const hasTelegramChannel = () => {
    return channels.some((channel) => channel.channel_type === "telegram");
  };

  const loadUserData = async (skipCache = false) => {
    try {
      if (!skipCache) {
        // Try to load user from localStorage first
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        }
      }

      // Check if we have a token
      const token = localStorage.getItem("auth_token");
      if (!token) {
        window.location.href = "/auth/login";
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";

      // Fetch current user data, subscriptions, and channels
      const [userResponse, subscriptionsResponse, channelsResponse] = await Promise.all([
        fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/subscriptions`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/channels`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!userResponse.ok) {
        // Token invalid, clear storage and redirect
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user");
        window.location.href = "/auth/login";
        return;
      }

      const userData = await userResponse.json();
      setUser(userData.user);
      localStorage.setItem("user", JSON.stringify(userData.user));

      if (subscriptionsResponse.ok) {
        const subscriptionsData = await subscriptionsResponse.json();
        setSubscriptions(subscriptionsData);
      } else {
        console.error("Failed to load subscriptions:", await subscriptionsResponse.text());
      }

      if (channelsResponse.ok) {
        const channelsData = await channelsResponse.json();
        setChannels(channelsData);
      } else {
        console.error("Failed to load channels:", await channelsResponse.text());
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserData();

    // Auto-refresh when user returns to the tab
    const handleFocus = () => {
      loadUserData(true); // Skip cache for fresh data
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const generateConnectionCode = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";

      const response = await fetch(`${apiUrl}/auth/connection-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setConnectionCode(data.code);
        setShowConnectionCode(true);
      }
    } catch (error) {
      console.error("Failed to generate connection code:", error);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("auth_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";

      // Call logout endpoint to clear server-side session
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear local storage and redirect
      localStorage.removeItem("auth_token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
  };

  const copyConnectionCode = () => {
    navigator.clipboard.writeText(connectionCode);
  };

  const handleAddRepository = () => {
    setShowAddRepo(true);
  };

  const handleAddRepoSuccess = (newSubscription?: any) => {
    if (newSubscription) {
      // Add the new subscription to the current list immediately
      setSubscriptions((prev) => [
        ...prev,
        {
          id: newSubscription.id,
          repo: newSubscription.repo,
          kind: newSubscription.kind,
          filters: newSubscription.filters,
          channels: newSubscription.channels,
          created_at: newSubscription.created_at,
          last_release: newSubscription.last_release
        }
      ]);
    } else {
      // Fallback: refresh subscriptions after adding a new repository
      loadUserData(true);
    }
  };

  const handleDeleteSubscription = async (subscriptionId: number, repoName: string) => {
    if (!confirm(`Are you sure you want to unsubscribe from ${repoName}?`)) {
      return;
    }

    // Optimistic update - remove from UI immediately
    const originalSubscriptions = [...subscriptions];
    setSubscriptions(subscriptions.filter((sub) => sub.id !== subscriptionId));

    try {
      const token = localStorage.getItem("auth_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";

      const response = await fetch(`${apiUrl}/subscriptions/${subscriptionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete subscription");
      }

      // Success - subscription is already removed from UI
    } catch (error) {
      console.error("Failed to delete subscription:", error);
      alert("Failed to delete subscription. Please try again.");
      // Rollback optimistic update
      setSubscriptions(originalSubscriptions);
    }
  };

  const handleDeleteChannel = async (channelId: number, displayName: string) => {
    if (
      !confirm(
        `Are you sure you want to remove ${displayName} channel? This will also remove it from all subscriptions.`
      )
    ) {
      return;
    }

    // Optimistic update - remove from UI immediately
    const originalChannels = [...channels];
    setChannels(channels.filter((channel) => channel.id !== channelId));

    try {
      const token = localStorage.getItem("auth_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://gitping-api.vlvt.sh";

      const response = await fetch(`${apiUrl}/channels/${channelId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete channel");
      }

      // Success - channel is already removed from UI
      // Also refresh subscriptions to update channel associations
      loadUserData(true);
    } catch (error) {
      console.error("Failed to delete channel:", error);
      alert("Failed to delete channel. Please try again.");
      // Rollback optimistic update
      setChannels(originalChannels);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700 mx-auto mb-4"></div>
          <p className="text-gray-700 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 text-sm mb-4">Please sign in to access your dashboard</p>
          <Link href="/auth/login" className="bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 font-medium text-sm">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center space-x-3">
                <Image
                  src="/gitping-logo.png"
                  alt="GitPing Logo"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-lg"
                />
                <span className="text-lg font-semibold text-gray-900">GitPing</span>
              </Link>
              <div className="border-l border-gray-300 h-6"></div>
              <img src={user.avatar_url} alt={user.name} className="h-8 w-8 rounded-full" />
              <div>
                <h1 className="text-base font-medium text-gray-900">{user.name}</h1>
                <p className="text-xs text-gray-600">@{user.github_username}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {channels.length > 0 ? (
                <div className="flex items-center space-x-2 bg-green-50 text-green-700 px-3 py-1 border border-green-200">
                  <MessageSquare className="h-3 w-3" />
                  <span className="text-xs font-medium">
                    {channels.length} channel{channels.length !== 1 ? "s" : ""}
                  </span>
                </div>
              ) : (
                <button
                  onClick={generateConnectionCode}
                  className="flex items-center space-x-2 bg-green-600 text-white px-3 py-2 border border-green-700 hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <MessageSquare className="h-3 w-3" />
                  <span>Add channel</span>
                </button>
              )}
              <button onClick={handleLogout} className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 text-sm">
                <LogOut className="h-3 w-3" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Connection Code Modal */}
        {showConnectionCode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white border border-gray-200 p-6 max-w-md w-full mx-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Add Telegram channel</h3>
              <p className="text-gray-700 text-sm mb-4">Send this verification code to the GitPing Telegram bot:</p>
              <div className="bg-gray-50 border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-mono font-bold text-gray-900">{connectionCode}</span>
                  <button
                    onClick={copyConnectionCode}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                    title="Copy code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-600 mb-4 space-y-2">
                <p>1. Open Telegram and start the GitPing bot:</p>
                <p className="ml-4">
                  <a
                    href="https://t.me/gitping_notify_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:text-green-800 underline font-medium"
                  >
                    @gitping_notify_bot
                  </a>
                </p>
                <p>2. Send this verification command:</p>
                <p className="ml-4">
                  <code className="bg-gray-200 text-gray-800 px-1 font-mono">/verify {connectionCode}</code>
                </p>
                <p>3. The code expires in 10 minutes</p>
              </div>
              <button
                onClick={() => {
                  setShowConnectionCode(false);
                  loadUserData(true); // Refresh to check if channel was added
                }}
                className="w-full bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 font-medium text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Channels */}
        <div className="bg-white border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">Notification channels ({channels.length})</h2>
              {!hasTelegramChannel() && (
                <button
                  onClick={generateConnectionCode}
                  className="flex items-center space-x-2 bg-green-600 text-white px-3 py-2 border border-green-700 hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Telegram</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {channels.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base font-medium text-gray-900 mb-2">No channels configured</h3>
                <p className="text-gray-700 text-sm mb-6 max-w-md mx-auto">
                  Add a notification channel to start receiving updates about your repositories.
                </p>
                <button
                  onClick={generateConnectionCode}
                  className="bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  Add your first channel
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {channels.map((channel) => (
                  <div key={channel.id} className="p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <MessageSquare className="h-3 w-3 text-green-600" />
                          <span className="font-medium text-gray-900 text-sm">{channel.display_name || "Telegram"}</span>
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            {channel.channel_type}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mb-1">Added {formatDateWithRelative(channel.created_at)}</p>
                        <p className="text-xs text-gray-500">Verified {formatDateTime(channel.verified_at)}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteChannel(channel.id, channel.display_name || "Telegram")}
                        className="text-red-500 hover:text-red-700 ml-2"
                        title="Remove channel"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Subscriptions */}
        <div className="bg-white border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-semibold text-gray-900">Your subscriptions ({subscriptions.length})</h2>
              <button
                onClick={handleAddRepository}
                className="flex items-center space-x-2 bg-green-600 text-white px-3 py-2 border border-green-700 hover:bg-green-700 transition-colors text-sm font-medium"
              >
                <Plus className="h-3 w-3" />
                <span>Add repository</span>
              </button>
            </div>
          </div>

          <div className="p-6">
            {subscriptions.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="h-8 w-8 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base font-medium text-gray-900 mb-2">No subscriptions yet</h3>
                <p className="text-gray-700 text-sm mb-6 max-w-md mx-auto">
                  Start by subscribing to repositories you want to track for new releases.
                </p>
                <button
                  onClick={handleAddRepository}
                  className="bg-green-600 text-white px-4 py-2 border border-green-700 hover:bg-green-700 transition-colors font-medium text-sm"
                >
                  Subscribe to your first repository
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="p-4 border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-medium text-gray-900 text-sm">
                            <a
                              href={`https://github.com/${sub.repo}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline transition-colors"
                            >
                              {sub.repo}
                            </a>
                          </h3>
                          <div className="flex space-x-1">
                            {sub.channels.map((channel, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                              >
                                Telegram
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mb-1">{sub.kind} notifications</p>
                        <div className="text-xs text-gray-500 mb-1">
                          Subscribed {formatDateWithRelative(sub.created_at)}
                        </div>
                        {sub.last_release ? (
                          <div className="text-xs text-gray-500">
                            Last release: <span className="font-medium">{sub.last_release.tag_name}</span>
                            <span className="mx-2">•</span>
                            {formatDateWithRelative(sub.last_release.published_at)}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">No releases yet</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteSubscription(sub.id, sub.repo)}
                        className="text-red-500 hover:text-red-700 ml-4"
                        title="Delete subscription"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Repository Modal */}
      <AddRepositoryModal
        isOpen={showAddRepo}
        onClose={() => setShowAddRepo(false)}
        onSuccess={handleAddRepoSuccess}
        channels={channels}
      />
    </div>
  );
}
