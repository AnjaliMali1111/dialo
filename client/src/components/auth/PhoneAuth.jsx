import React, { useState } from 'react';
import { COUNTRIES } from '../../utils/countries';
import { Phone, ArrowRight, ShieldCheck, Sparkles, Check, ChevronDown, User, MessageCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export default function PhoneAuth({ onAuthenticated }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'profile'
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phoneInput, setPhoneInput] = useState('');
  const [fullPhone, setFullPhone] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('Hey there! I am using WhatsApp.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Step 1: Send OTP
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!phoneInput.trim()) {
      setError('Please enter your phone number.');
      return;
    }

    const cleaned = phoneInput.replace(/[^0-9]/g, '');
    if (cleaned.length < 5) {
      setError('Please enter a valid phone number (at least 5 digits).');
      return;
    }

    const formattedFullPhone = `${selectedCountry.code}${cleaned}`;
    setFullPhone(formattedFullPhone);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedFullPhone })
      });
      const data = await res.json();
      if (data.success) {
        setStep('otp');
      } else {
        setError(data.message || 'Could not send verification code.');
      }
    } catch (err) {
      setError('Failed to connect to WhatsApp server. Is server running on port 5000?');
    } finally {
      setLoading(false);
    }
  };

  // Handle individual OTP digit change
  const handleOtpDigitChange = (index, value) => {
    if (value.length > 1) {
      // Pasted full code
      const digits = value.replace(/[^0-9]/g, '').slice(0, 6).split('');
      const newOtp = [...otpCode];
      digits.forEach((d, i) => {
        newOtp[i] = d;
      });
      setOtpCode(newOtp);
      if (digits.length === 6) {
        document.getElementById(`otp-5`)?.focus();
      }
      return;
    }

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    // Auto-advance to next input box
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    const code = otpCode.join('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          code,
          name: name.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        if (!data.user.name || data.user.name.startsWith('User ')) {
          // Prompt user to set their name and photo
          setStep('profile');
        } else {
          // Already has a profile
          onAuthenticated(data.user);
        }
      } else {
        setError(data.message || 'Verification failed.');
      }
    } catch (err) {
      setError('Error verifying code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Complete Profile Setup
  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhone,
          name: name.trim(),
          bio: bio.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        onAuthenticated(data.user);
      } else {
        setError(data.message || 'Could not update profile.');
      }
    } catch (err) {
      setError('Failed to save profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-[#111b21] text-[#e9edef] relative selection:bg-[#00a884] selection:text-white">
      {/* WhatsApp Green Accent Top Banner */}
      <div className="fixed top-0 inset-x-0 h-48 bg-[#00a884] -z-10" />

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-[#202c33] rounded-2xl shadow-2xl p-6 sm:p-8 border border-[#2a3942] z-10">
        {/* WhatsApp Logo & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#00a884] text-white shadow-lg mb-3">
            <MessageCircle className="w-9 h-9 fill-current" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">WhatsApp Web</h1>
          <p className="text-xs text-[#8696a0] mt-1">
            {step === 'phone' && 'Enter your phone number to get started'}
            {step === 'otp' && `Verifying ${fullPhone}`}
            {step === 'profile' && 'Complete your profile info'}
          </p>
        </div>

        {error && (
          <div className="mb-5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: PHONE NUMBER INPUT */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            {/* Country Selector */}
            <div className="relative">
              <label className="block text-xs text-[#8696a0] mb-1 font-medium">Country / Region</label>
              <button
                type="button"
                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                className="w-full py-2.5 px-3.5 bg-[#111b21] border border-[#2a3942] rounded-xl flex items-center justify-between text-sm text-left hover:border-[#00a884] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{selectedCountry.flag}</span>
                  <span className="text-white font-medium">{selectedCountry.name}</span>
                  <span className="text-[#8696a0] font-mono">({selectedCountry.code})</span>
                </span>
                <ChevronDown className="w-4 h-4 text-[#8696a0]" />
              </button>

              {/* Country Dropdown List */}
              {showCountryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#111b21] border border-[#2a3942] rounded-xl shadow-2xl z-30 divide-y divide-[#202c33]">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.name + c.code}
                      type="button"
                      onClick={() => {
                        setSelectedCountry(c);
                        setShowCountryDropdown(false);
                      }}
                      className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#202c33] text-xs text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span>{c.flag}</span>
                        <span className="text-gray-200">{c.name}</span>
                      </span>
                      <span className="text-[#8696a0] font-mono">{c.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Phone Number Field */}
            <div>
              <label className="block text-xs text-[#8696a0] mb-1 font-medium">Phone Number</label>
              <div className="flex gap-2">
                <span className="px-3.5 py-2.5 bg-[#111b21] border border-[#2a3942] rounded-xl text-sm font-mono text-[#8696a0] flex items-center">
                  {selectedCountry.code}
                </span>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder={`e.g. ${selectedCountry.sample}`}
                  className="flex-1 px-4 py-2.5 bg-[#111b21] border border-[#2a3942] rounded-xl text-white placeholder-[#8696a0] text-sm focus:outline-none focus:border-[#00a884] transition-colors font-mono"
                  autoFocus
                />
              </div>
            </div>

            <p className="text-[11px] text-[#8696a0] leading-relaxed">
              WhatsApp will send an SMS or simulated OTP to verify your phone number. Carrier SMS charges may apply in production.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00a884] hover:bg-[#02906f] disabled:opacity-50 text-white font-medium rounded-xl shadow-md flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] text-sm"
            >
              {loading ? 'Requesting Code...' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label className="block text-xs text-center text-[#8696a0] mb-3">
                Enter the 6-digit code sent to <strong className="text-white">{fullPhone}</strong>
              </label>

              {/* 6 Digit Input Boxes */}
              <div className="flex justify-between gap-2">
                {otpCode.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-12 text-center text-xl font-bold bg-[#111b21] border border-[#2a3942] rounded-xl text-white focus:outline-none focus:border-[#00a884] transition-colors"
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setError('');
                }}
                className="py-3 px-4 bg-[#111b21] hover:bg-[#202c33] border border-[#2a3942] text-[#8696a0] hover:text-white rounded-xl text-xs font-medium transition-colors"
              >
                Wrong Number?
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-[#00a884] hover:bg-[#02906f] disabled:opacity-50 text-white font-medium rounded-xl shadow-md flex items-center justify-center gap-2 transition-all text-sm"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
                <Check className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: PROFILE SETUP */}
        {step === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="text-center my-2">
              <div className="w-20 h-20 rounded-full bg-[#111b21] border-2 border-[#00a884] mx-auto flex items-center justify-center text-3xl font-bold text-[#00a884] shadow-inner mb-2">
                {name ? name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
              </div>
              <p className="text-xs text-[#8696a0]">This name will be visible to your WhatsApp contacts.</p>
            </div>

            <div>
              <label className="block text-xs text-[#8696a0] mb-1 font-medium">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                maxLength={30}
                className="w-full px-4 py-2.5 bg-[#111b21] border border-[#2a3942] rounded-xl text-white placeholder-[#8696a0] text-sm focus:outline-none focus:border-[#00a884] transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-[#8696a0] mb-1 font-medium">About / Status</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Hey there! I am using WhatsApp."
                maxLength={60}
                className="w-full px-4 py-2.5 bg-[#111b21] border border-[#2a3942] rounded-xl text-white placeholder-[#8696a0] text-sm focus:outline-none focus:border-[#00a884] transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-3 bg-[#00a884] hover:bg-[#02906f] disabled:opacity-50 text-white font-medium rounded-xl shadow-md flex items-center justify-center gap-2 transition-all text-sm mt-2"
            >
              {loading ? 'Saving...' : 'Start Chatting'}
              <Check className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Security badge footer */}
        <div className="mt-6 pt-4 border-t border-[#2a3942] flex items-center justify-center gap-1.5 text-xs text-[#8696a0]">
          <ShieldCheck className="w-4 h-4 text-[#00a884]" />
          <span>Your messages and calls are end-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}
