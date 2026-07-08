"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LAB_INFO } from "@/lib/constants/labels";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { getDefaultRoute } from "@/lib/permissions";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, currentUser } = useApp();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && currentUser) {
    router.replace(getDefaultRoute(currentUser.role));
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login(username, password);
      if (user) {
        router.push(getDefaultRoute(user.role));
      } else {
        setError("שם משתמש או סיסמה שגויים");
      }
    } catch {
      setError("שם משתמש או סיסמה שגויים");
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 right-1/4 h-96 w-96 rounded-full bg-opal-gold blur-3xl" />
        </div>
        <div className="relative text-center px-12">
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-opal-gold shadow-2xl shadow-opal-gold/30">
            <svg viewBox="0 0 24 24" className="h-14 w-14 text-white" fill="currentColor">
              <path d="M12 2C8.5 2 6 4.5 6 8c0 2 1 3.5 2.5 4.5C7 13.5 5 15.5 5 19h14c0-3.5-2-5.5-3.5-6.5C17 11.5 18 10 18 8c0-3.5-2.5-6-6-6zm0 2c2.2 0 4 1.8 4 4 0 1.5-.8 2.8-2 3.5-.5.3-1 1-1 2h-2c0-1-.5-1.7-1-2C8.8 10.8 8 9.5 8 8c0-2.2 1.8-4 4-4z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">{LAB_INFO.fullName}</h1>
          <p className="text-opal-gold text-xl">{LAB_INFO.subtitle}</p>
          <p className="text-slate-400 mt-4">{LAB_INFO.manager}</p>
          <p className="text-slate-500 text-sm mt-8">{LAB_INFO.phone} · {LAB_INFO.location}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">{LAB_INFO.name}</h1>
            <p className="text-slate-500">{LAB_INFO.subtitle}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-1">כניסה למערכת</h2>
            <p className="text-sm text-slate-500 mb-6">הזן שם משתמש וסיסמה</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label>שם משתמש</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username" />
              </div>
              <div>
                <Label>סיסמה</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••" autoComplete="current-password" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" size="lg" className="w-full">כניסה</Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2">חשבונות לדוגמה (סיסמה: 1234)</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-500">
                <span>admin — מנהל</span>
                <span>sara — מזכירות</span>
                <span>mohamed — מעצב</span>
                <span>drmansour — רופא</span>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            <a href="/attendance" className="hover:text-opal-gold">נוכחות NFC →</a>
          </p>
        </div>
      </div>
    </div>
  );
}
