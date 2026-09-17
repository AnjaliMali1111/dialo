import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, User, Phone, Plus, UserPlus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export default function NewChatModal({ currentUser, onSelectContact, onClose }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/users?excludePhone=${encodeURIComponent(currentUser.phone)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setContacts(data.users);
        }
      })
      .catch(e => console.warn('Could not fetch contacts:', e))
      .finally(() => setLoading(false));
  }, [currentUser.phone]);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const handleStartCustomChat = (e) => {
    e.preventDefault();
    if (!customPhone.trim()) return;
    const cleanPhone = customPhone.trim();
    onSelectContact({
      phone: cleanPhone,
      name: `Contact ${cleanPhone}`,
      bio: 'Hey there! I am using WhatsApp.',
      isOnline: false
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-[#111b21] z-30 flex flex-col animate-fadeIn">
      {/* Header */}
      <div className="h-28 bg-[#202c33] px-4 flex items-end pb-4 gap-4 text-white">
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#2a3942] rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#aebac1]" />
        </button>
        <h2 className="text-lg font-medium">New Chat</h2>
      </div>

      {/* Search Input */}
      <div className="p-3 bg-[#111b21] border-b border-[#202c33]">
        <div className="relative flex items-center bg-[#202c33] rounded-lg px-3 py-1.5 text-sm">
          <Search className="w-4 h-4 text-[#8696a0] mr-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts by name or phone..."
            className="w-full bg-transparent text-white placeholder-[#8696a0] focus:outline-none text-xs"
          />
        </div>
      </div>

      {/* Start Chat by Direct Phone Number */}
      <div className="p-3 bg-[#182229] border-b border-[#202c33]">
        <form onSubmit={handleStartCustomChat} className="flex gap-2">
          <input
            type="tel"
            value={customPhone}
            onChange={(e) => setCustomPhone(e.target.value)}
            placeholder="Enter any phone number (e.g. +15550102)"
            className="flex-1 px-3 py-1.5 bg-[#111b21] border border-[#2a3942] rounded-lg text-white placeholder-[#8696a0] text-xs font-mono focus:outline-none focus:border-[#00a884]"
          />
          <button
            type="submit"
            disabled={!customPhone.trim()}
            className="px-3 py-1.5 bg-[#00a884] hover:bg-[#02906f] disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
        </form>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#202c33]/50">
        <div className="px-4 py-2 text-[11px] font-semibold text-[#00a884] uppercase tracking-wider">
          Registered Contacts ({filteredContacts.length})
        </div>

        {loading && (
          <div className="p-6 text-center text-xs text-[#8696a0]">Loading contacts...</div>
        )}

        {!loading && filteredContacts.length === 0 && (
          <div className="p-6 text-center text-xs text-[#8696a0]">
            No contacts found matching "{search}".
          </div>
        )}

        {filteredContacts.map((contact) => (
          <button
            key={contact.phone}
            type="button"
            onClick={() => {
              onSelectContact(contact);
              onClose();
            }}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#202c33] transition-colors text-left"
          >
            {/* Contact Avatar */}
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center font-bold text-white text-base overflow-hidden border border-[#374248]">
                {contact.avatar ? (
                  <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                ) : (
                  contact.name.charAt(0).toUpperCase()
                )}
              </div>
              {contact.isOnline && (
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#00a884] border-2 border-[#111b21]" />
              )}
            </div>

            {/* Contact Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-white text-sm font-medium truncate">{contact.name}</span>
                <span className="text-[11px] text-[#8696a0] font-mono">{contact.phone}</span>
              </div>
              <p className="text-xs text-[#8696a0] truncate mt-0.5">{contact.bio}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
