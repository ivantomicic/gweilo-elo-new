'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon } from '@/components/ui/icon'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/20">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xs mb-10 flex flex-col items-center">
          <div className="relative group">
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <img
              src="/logo.png"
              alt="GWEILO NS Logo"
              className="relative w-full h-auto drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isLogin ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full space-y-4 max-w-sm"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold font-heading tracking-tight mb-2">Welcome Back</h1>
                <p className="text-muted-foreground">Sign in to track your matches and stats</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Icon icon="solar:letter-bold" className="size-5 text-muted-foreground" />
                    </div>
                    <input
                      type="email"
                      placeholder="alex.chen@example.com"
                      className="w-full h-14 bg-input border border-border/50 rounded-2xl pl-12 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Password
                    </label>
                    <button className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Icon icon="solar:lock-password-bold" className="size-5 text-muted-foreground" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      className="w-full h-14 bg-input border border-border/50 rounded-2xl pl-12 pr-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    >
                      <Icon
                        icon={showPassword ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        className="size-5 text-muted-foreground hover:text-foreground transition-colors"
                      />
                    </button>
                  </div>
                </div>

                <button className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4">
                  <span>Sign In</span>
                  <Icon icon="solar:login-2-bold" className="size-5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="register"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full space-y-4 max-w-sm"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold font-heading tracking-tight mb-2">Create Account</h1>
                <p className="text-muted-foreground">Join to start tracking your matches</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Icon icon="solar:user-bold" className="size-5 text-muted-foreground" />
                    </div>
                    <input
                      type="text"
                      placeholder="Alex Chen"
                      className="w-full h-14 bg-input border border-border/50 rounded-2xl pl-12 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Icon icon="solar:letter-bold" className="size-5 text-muted-foreground" />
                    </div>
                    <input
                      type="email"
                      placeholder="alex.chen@example.com"
                      className="w-full h-14 bg-input border border-border/50 rounded-2xl pl-12 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Icon icon="solar:lock-password-bold" className="size-5 text-muted-foreground" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      className="w-full h-14 bg-input border border-border/50 rounded-2xl pl-12 pr-12 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    >
                      <Icon
                        icon={showPassword ? 'solar:eye-bold' : 'solar:eye-closed-bold'}
                        className="size-5 text-muted-foreground hover:text-foreground transition-colors"
                      />
                    </button>
                  </div>
                </div>

                <button className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4">
                  <span>Create Account</span>
                  <Icon icon="solar:user-plus-bold" className="size-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full max-w-sm mt-6">
          <div className="flex items-center gap-4 py-4">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Or continue with
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center h-12 bg-secondary border border-border/50 rounded-xl active:scale-[0.98] transition-all">
              <Icon icon="logos:apple" className="size-5 invert" />
            </button>
            <button className="flex items-center justify-center h-12 bg-secondary border border-border/50 rounded-xl active:scale-[0.98] transition-all">
              <Icon icon="logos:google-icon" className="size-5" />
            </button>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="ml-1 font-bold text-primary hover:underline transition-all"
            >
              {isLogin ? 'Create Account' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>

      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-24 -right-24 size-64 bg-primary/10 blur-[100px] rounded-full" />
        <div className="absolute top-1/2 -left-32 size-96 bg-primary/5 blur-[120px] rounded-full" />
      </div>
    </div>
  )
}
