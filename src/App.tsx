import React, { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { WatchlistItem, ContentType, Platform, WatchStatus } from './types';
import { getRecommendation } from './services/geminiService';
import { searchFilm, DetailedFilmInfo, getSearchSuggestions, SearchSuggestion, getFilmDetailsById, searchAll, SearchResultItem } from './services/tmdbService';
import {
  Film,
  Tv,
  Gamepad2,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  PlayCircle,
  Star,
  Sparkles,
  LogOut,
  Search,
  Filter,
  ChevronDown,
  X,
  Info,
  Calendar,
  User,
  Tags,
  ExternalLink,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

import { useSettings } from './contexts/SettingsContext';
import { SettingsModal } from './components/SettingsModal';

// --- Components ---

const PLATFORMS: Platform[] = ['Netflix', 'Prime Video', 'Now', 'Disney+'];
const TYPES: ContentType[] = ['film', 'tv'];
const STATUSES: WatchStatus[] = ['to-watch', 'watching', 'watched'];

function CustomSelect({
  value,
  onChange,
  options,
  icon: Icon,
  isActive = false,
  activeVariant = 'cyan'
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ElementType;
  isActive?: boolean;
  activeVariant?: 'cyan' | 'magenta' | 'lime';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value) || options[0];

  const variantClasses = {
    cyan: "bg-cyan-50 dark:bg-neon-cyan/20 border-cyan-300 dark:border-neon-cyan/50 text-cyan-700 dark:text-neon-cyan",
    magenta: "bg-fuchsia-50 dark:bg-neon-magenta/20 border-fuchsia-300 dark:border-neon-magenta/50 text-fuchsia-700 dark:text-neon-magenta",
    lime: "bg-lime-50 dark:bg-neon-lime/20 border-lime-300 dark:border-neon-lime/50 text-lime-700 dark:text-neon-lime"
  };

  const activeClass = variantClasses[activeVariant] || variantClasses.cyan;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-2 transition-colors border",
          isActive 
            ? activeClass 
            : "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10 text-gray-900 dark:text-white"
        )}
      >
        {Icon && <Icon className={cn("w-4 h-4", isActive ? "currentColor" : "text-gray-500")} />}
        <span className="text-sm font-medium">{selectedOption.label}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", isActive ? "currentColor" : "text-gray-500", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-2 min-w-[180px] bg-white/80 dark:bg-[#0a0a0a]/90 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden z-[70] py-2"
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors",
                    value === opt.value
                      ? (activeVariant === 'cyan' ? "bg-cyan-50 dark:bg-neon-cyan/20 text-cyan-700 dark:text-neon-cyan font-bold" :
                         activeVariant === 'magenta' ? "bg-fuchsia-50 dark:bg-neon-magenta/20 text-fuchsia-700 dark:text-neon-magenta font-bold" :
                         "bg-lime-50 dark:bg-neon-lime/20 text-lime-700 dark:text-neon-lime font-bold")
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [user, loading] = useAuthState(auth);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'All'>('All');
  const [filterType, setFilterType] = useState<ContentType | 'All'>('All');
  const [sortBy, setSortBy] = useState<string>('default');
  const [filterGenre, setFilterGenre] = useState<string>('All');
  const [mood, setMood] = useState('');
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [isRecLoading, setIsRecLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState<WatchStatus | 'suggestions' | 'profile'>('to-watch');

  const { t, language } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Scroll tracking for search bar
  const [showSearch, setShowSearch] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setShowSearch(false);
      } else {
        setShowSearch(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<DetailedFilmInfo | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Full search results
  const [searchResultsList, setSearchResultsList] = useState<SearchResultItem[] | null>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchQuery.trim().length > 1) {
        const results = await getSearchSuggestions(searchQuery, language);
        setSuggestions(results);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
      return;
    }

    const q = query(
      collection(db, 'watchlist'),
      where('userUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WatchlistItem[];
      setWatchlist(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'watchlist');
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const newItem = {
      title: formData.get('title') as string,
      type: formData.get('type') as ContentType,
      platform: formData.get('platform') as Platform,
      status: (formData.get('status') as WatchStatus) || (currentTab !== 'suggestions' ? currentTab : 'to-watch'),
      userUid: user.uid,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'watchlist'), newItem);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'watchlist');
    }
  };

  const handleAddFromSearch = async (platform: Platform) => {
    if (!user || !searchResult) return;

    const validStatuses = ['to-watch', 'watching', 'watched'];
    const targetStatus = validStatuses.includes(currentTab) ? (currentTab as WatchStatus) : 'to-watch';

    const newItem: any = {
      title: searchResult.title,
      type: searchResult.type,
      platform: platform,
      status: targetStatus,
      userUid: user.uid,
      createdAt: serverTimestamp(),
    };
    
    if (searchResult.duration) newItem.duration = searchResult.duration;
    if (searchResult.releaseYear) newItem.releaseYear = searchResult.releaseYear;
    if (searchResult.genres) newItem.genres = searchResult.genres;
    if (searchResult.tmdbId) newItem.tmdbId = searchResult.tmdbId;

    try {
      await addDoc(collection(db, 'watchlist'), newItem);
      setShowDetail(false);
      setSearchResult(null);
      setSearchResultsList(null);
      setSearchQuery('');
      setCurrentTab(targetStatus);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'watchlist');
    }
  };

  const handleUpdateStatus = async (id: string, status: WatchStatus) => {
    try {
      await updateDoc(doc(db, 'watchlist', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `watchlist/${id}`);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'watchlist', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `watchlist/${id}`);
    }
  };

  const handleGetRec = async () => {
    if (!mood.trim()) return;
    setIsRecLoading(true);
    const rec = await getRecommendation(mood, watchlist);
    setRecommendation(rec);
    setIsRecLoading(false);
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) {
      e.preventDefault();
      (document.activeElement as HTMLElement)?.blur();
    }
    const q = overrideQuery || searchQuery;
    if (!q.trim()) return;

    setIsSearching(true);
    setShowSuggestions(false);
    setSuggestions([]);
    
    const results = await searchAll(q);
    setSearchResultsList(results);
    
    setIsSearching(false);
  };

  const currentTabItems = watchlist.filter(item => item.status === currentTab);
  const uniqueGenres = Array.from(new Set(
    currentTabItems.flatMap(item => item.genres || [])
  )).sort();

  const filteredList = watchlist.filter(item => {
    const platformMatch = filterPlatform === 'All' || item.platform === filterPlatform;
    const typeMatch = filterType === 'All' || item.type === filterType || (filterType === 'tv' && item.type === 'anime' as any);
    const genreMatch = filterGenre === 'All' || (item.genres && item.genres.includes(filterGenre));
    return platformMatch && typeMatch && genreMatch;
  }).sort((a, b) => {
    if (sortBy === 'default') return 0;
    if (sortBy === 'duration-asc' || sortBy === 'duration-desc') {
      const parseDuration = (d?: string) => {
        if (!d) return 0;
        let mins = 0;
        const hMatch = d.match(/(\d+)h/);
        const mMatch = d.match(/(\d+)m/);
        if (hMatch) mins += parseInt(hMatch[1] || '0') * 60;
        if (mMatch) mins += parseInt(mMatch[1] || '0');
        return mins;
      };
      const dA = parseDuration(a.duration);
      const dB = parseDuration(b.duration);
      return sortBy === 'duration-asc' ? dA - dB : dB - dA;
    }
    if (sortBy === 'year-desc' || sortBy === 'year-asc') {
      const yA = a.releaseYear || 0;
      const yB = b.releaseYear || 0;
      return sortBy === 'year-asc' ? yA - yB : yB - yA;
    }
    return 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] text-gray-900 dark:text-white flex flex-col items-center justify-center p-4">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="text-center max-w-md"
         >
           <div className="mb-8 flex justify-center">
             <div className="relative">
               <Film className="w-16 h-16 text-neon-cyan glow-cyan" />
               <Sparkles className="w-6 h-6 text-neon-yellow absolute -top-2 -right-2 animate-pulse" />
             </div>
           </div>
           <h1 className="text-5xl font-bold mb-4 tracking-tight text-glow-cyan">CineMood</h1>
           <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
             {t('tagline')}
           </p>
           <button
             onClick={loginWithGoogle}
             className="w-full bg-gray-900 dark:bg-white text-white dark:text-black font-bold py-4 px-8 rounded-full hover:bg-neon-magenta hover:text-white transition-all duration-300 flex items-center justify-center gap-3 shadow-xl dark:hover:glow-magenta"
           >
             <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
             {t('signInWithGoogle')}
           </button>
         </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100vh] bg-transparent font-sans selection:bg-neon-magenta/30 pb-32">
      {/* Top Search Section (Smart Hide) */}
      <motion.header
        initial={{ y: 0 }}
        animate={{ y: showSearch ? 0 : -100 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-[#050505]/80 backdrop-blur-md px-6 py-4 flex justify-center border-b border-gray-200 dark:border-white/5"
      >
        <form onSubmit={handleSearch} className="w-full max-w-2xl relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-neon-cyan transition-colors z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if(suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full py-3 pl-12 pr-4 outline-none focus:border-neon-cyan dark:focus:bg-white/10 transition-all text-lg text-gray-900 dark:text-white focus:glow-cyan relative z-10"
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10">
              <div className="w-5 h-5 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
            </div>
          )}

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[60]"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.id}-${i}`}
                    type="button"
                    onClick={async () => {
                      setSearchQuery(s.title);
                      setShowSuggestions(false);
                      setIsSearching(true);
                      const result = await getFilmDetailsById(s.id, s.type === 'tv' ? 'tv' : 'movie', language);
                      if (result) {
                        setSearchResult(result);
                        setShowDetail(true);
                      }
                      setIsSearching(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 flex items-center gap-3"
                  >
                    <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">{s.title}</span>
                      {s.year && <span className="text-gray-500 text-sm ml-2">({s.year})</span>}
                      <span className="text-[10px] uppercase tracking-wider text-neon-cyan ml-2 bg-neon-cyan/10 px-1.5 py-0.5 rounded">
                        {s.type === 'tv' ? t('tvSeries') : t('films')}
                      </span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </motion.header>

      <main className="max-w-4xl mx-auto p-6 pt-24">
        <AnimatePresence mode="wait">
          {searchResultsList !== null ? (
            <motion.div
              key="search-results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-glow-cyan flex items-center gap-3">
                  <Search className="w-8 h-8" />
                  {t('resultsFor')} "{searchQuery}"
                </h2>
                <button
                  onClick={() => setSearchResultsList(null)}
                  className="p-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-white rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {searchResultsList.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-300 dark:border-white/10">
                  <Search className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500">{t('noResultsFor')} "{searchQuery}".</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                  {searchResultsList.map((item) => (
                    <motion.div
                      key={item.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="cursor-pointer group relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 shadow-lg"
                      onClick={async () => {
                        setIsSearching(true);
                        const result = await getFilmDetailsById(item.id, item.type === 'tv' ? 'tv' : 'movie', language);
                        if (result) {
                          setSearchResult(result);
                          setShowDetail(true);
                        }
                        setIsSearching(false);
                      }}
                    >
                      <div className="aspect-[2/3] relative">
                        {item.posterUrl ? (
                          <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 dark:bg-black/40 text-gray-500">
                            {item.type === 'film' ? <Film className="w-8 h-8 mb-2" /> : <Tv className="w-8 h-8 mb-2" />}
                            <span className="text-xs">{t('noPoster')}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100" />
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="font-bold text-sm leading-tight text-white mb-1 line-clamp-2">{item.title}</h3>
                          <div className="flex items-center gap-2">
                            {item.year && <span className="text-xs text-gray-300 dark:text-gray-400">{item.year}</span>}
                            <span className="text-[9px] uppercase tracking-widest text-neon-cyan bg-neon-cyan/20 px-1.5 py-0.5 rounded">
                              {item.type === 'tv' ? t('tvSeries') : t('films')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : currentTab === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Profile Header */}
              <div className="bg-gradient-to-br from-blue-100 to-white dark:from-blue-900/20 dark:to-[#0a0a0a] border border-blue-200 dark:border-blue-500/20 rounded-3xl p-8 relative overflow-hidden shadow-sm dark:shadow-[0_0_30px_rgba(59,130,246,0.05)]">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="absolute top-6 right-6 z-20 p-3 bg-gray-200 hover:bg-gray-300 dark:bg-white/10 dark:hover:bg-white/20 rounded-full transition-colors text-gray-700 dark:text-white"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <div className="absolute top-0 left-0 p-4 opacity-10 dark:opacity-5 text-blue-500 dark:text-white">
                  <User className="w-48 h-48" />
                </div>
                <div className="flex items-center gap-6 relative z-10">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full border-4 border-white dark:border-blue-500/30 shadow-md dark:shadow-[0_0_15px_rgba(59,130,246,0.3)]" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center border-4 border-white dark:border-blue-500/30 shadow-md dark:shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                      <User className="w-10 h-10 text-blue-500 dark:text-blue-400" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1 drop-shadow-sm dark:drop-shadow-md">{user.displayName || 'Cinemood User'}</h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{user.email}</p>
                  </div>
                </div>
              </div>

              {/* Stats & Previews */}
              <div>
                 <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Film className="w-5 h-5 text-gray-500" />
                    {t('yourHub')}
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {[
                     { status: 'to-watch', title: t('toWatch'), icon: Clock, color: 'text-neon-cyan', bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/20' },
                     { status: 'watching', title: t('watching'), icon: PlayCircle, color: 'text-neon-magenta', bg: 'bg-neon-magenta/10', border: 'border-neon-magenta/20' },
                     { status: 'watched', title: t('watched'), icon: CheckCircle2, color: 'text-neon-lime', bg: 'bg-neon-lime/10', border: 'border-neon-lime/20' }
                   ].map((sec) => {
                     const sectionItems = watchlist.filter(item => item.status === sec.status);
                     const Icon = sec.icon;
                     return (
                       <div 
                         key={sec.status} 
                         onClick={() => setCurrentTab(sec.status as WatchStatus)} 
                         className={`bg-white dark:bg-white/5 rounded-3xl p-6 border border-gray-100 dark:${sec.border} cursor-pointer hover:bg-gray-50 dark:hover:bg-white/10 transition-colors group relative overflow-hidden shadow-sm dark:shadow-lg`}
                       >
                         <div className="flex items-center justify-between mb-6">
                            <div className={`flex items-center gap-2 ${sec.color.replace('text-', 'text-').replace('neon-', '')} dark:${sec.color} font-bold`}>
                              <div className={`p-2 rounded-lg ${sec.bg.replace('/10', '/20')} dark:${sec.bg}`}>
                                 <Icon className="w-5 h-5" />
                              </div>
                              {sec.title}
                            </div>
                            <div className="text-4xl font-black text-gray-100 dark:text-white dark:mix-blend-overlay opacity-50 dark:opacity-100">{sectionItems.length}</div>
                         </div>
                         <div className="space-y-3 mt-4 relative z-10 min-h-[80px]">
                           {sectionItems.slice(0, 3).map(item => (
                             <div key={item.id} className="text-sm text-gray-700 dark:text-gray-300 truncate opacity-90 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${sec.bg.replace('/10', '').replace('bg-neon-', 'bg-').concat('-500')} dark:${sec.bg.replace('/10', '')}`} />
                                {item.title}
                             </div>
                           ))}
                           {sectionItems.length === 0 && <div className="text-sm text-gray-500 dark:text-gray-600 italic mt-2">{t('noMovies')}</div>}
                         </div>
                         
                         <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('viewAll')} &rarr;</span>
                         </div>
                       </div>
                     );
                   })}
                 </div>
              </div>

              {/* Logout Button */}
              <div className="pt-12 pb-8 flex justify-center">
                 <button
                  onClick={logout}
                  className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 font-bold py-4 px-12 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_25px_rgba(239,68,68,0.25)] group"
                 >
                  <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  {t('logout')}
                 </button>
              </div>

            </motion.div>
          ) : currentTab !== 'suggestions' ? (
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg glow-sm",
                    currentTab === 'to-watch' ? "bg-neon-cyan/20 text-neon-cyan glow-cyan" :
                      currentTab === 'watching' ? "bg-neon-magenta/20 text-neon-magenta glow-magenta" :
                        "bg-neon-lime/20 text-neon-lime glow-lime"
                  )}>
                    {currentTab === 'to-watch' ? <Clock className="w-6 h-6" /> :
                      currentTab === 'watching' ? <PlayCircle className="w-6 h-6" /> :
                        <CheckCircle2 className="w-6 h-6" />}
                  </div>
                  <h2 className={cn(
                    "text-3xl font-bold tracking-tight capitalize",
                    currentTab === 'to-watch' ? "text-glow-cyan" :
                      currentTab === 'watching' ? "text-glow-magenta" :
                        "text-glow-lime"
                  )}>
                    {currentTab === 'to-watch' ? t('toWatch') :
                     currentTab === 'watching' ? t('watching') :
                     t('watched')}
                  </h2>
                </div>

              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 relative z-30">
                <CustomSelect
                  value={filterPlatform}
                  onChange={(val) => setFilterPlatform(val as any)}
                  icon={Filter}
                  isActive={filterPlatform !== 'All'}
                  activeVariant={currentTab === 'to-watch' ? 'cyan' : currentTab === 'watching' ? 'magenta' : 'lime'}
                  options={[
                    { value: 'All', label: t('allPlatforms') },
                    ...PLATFORMS.map(p => ({ value: p, label: p }))
                  ]}
                />
                <CustomSelect
                  value={filterType}
                  onChange={(val) => setFilterType(val as any)}
                  isActive={filterType !== 'All'}
                  activeVariant={currentTab === 'to-watch' ? 'cyan' : currentTab === 'watching' ? 'magenta' : 'lime'}
                  options={[
                    { value: 'All', label: t('allTypes') },
                    ...TYPES.map(typeVal => ({ value: typeVal, label: typeVal === 'tv' ? t('tvSeries') : t('films') }))
                  ]}
                />
                <CustomSelect
                  value={filterGenre}
                  onChange={(val) => setFilterGenre(val)}
                  isActive={filterGenre !== 'All'}
                  activeVariant={currentTab === 'to-watch' ? 'cyan' : currentTab === 'watching' ? 'magenta' : 'lime'}
                  options={[
                    { value: 'All', label: t('allGenres') },
                    ...uniqueGenres.map(genre => ({ value: genre, label: genre }))
                  ]}
                />
                <CustomSelect
                  value={sortBy}
                  onChange={(val) => setSortBy(val)}
                  isActive={sortBy !== 'default'}
                  activeVariant={currentTab === 'to-watch' ? 'cyan' : currentTab === 'watching' ? 'magenta' : 'lime'}
                  options={[
                    { value: 'default', label: t('sortDefault') },
                    { value: 'duration-asc', label: t('sortDurationAsc') },
                    { value: 'duration-desc', label: t('sortDurationDesc') },
                    { value: 'year-desc', label: t('sortYearDesc') },
                    { value: 'year-asc', label: t('sortYearAsc') }
                  ]}
                />
              </div>

              {/* List */}
              <div className="space-y-8">
                <AnimatePresence mode="popLayout">
                  {filteredList.filter(i => i.status === currentTab).length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-20 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-300 dark:border-white/10"
                    >
                      <Clock className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500">{t('nothingInYourList')}</p>
                    </motion.div>
                  ) : (
                    <>
                      {filteredList.filter(i => i.status === currentTab && i.type === 'film').length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold text-gray-700 dark:text-gray-400 flex items-center gap-2 pl-2">
                            <Film className="w-5 h-5" /> {t('films')}
                          </h3>
                          <div className="space-y-3">
                            {filteredList.filter(i => i.status === currentTab && i.type === 'film').map((item) => (
                              <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between group hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                onClick={async (e) => {
                                  if ((e.target as HTMLElement).closest('button')) return;
                                  setIsSearching(true);
                                  const result = item.tmdbId
                                    ? await getFilmDetailsById(item.tmdbId, item.type === 'tv' ? 'tv' : 'movie', language)
                                    : await searchFilm(item.title, language);
                                  if (result) {
                                    setSearchResult(result);
                                    setShowDetail(true);
                                  }
                                  setIsSearching(false);
                                }}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="p-3 rounded-xl bg-neon-cyan/20 text-neon-cyan">
                                    <Film className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">{item.title}</h3>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                                      {item.releaseYear && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded">{item.releaseYear}</span>}
                                      {item.duration && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded">{item.duration}</span>}
                                      {item.platform && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider">{item.platform}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {STATUSES.map(s => (
                                      <button
                                        key={s}
                                        onClick={() => handleUpdateStatus(item.id!, s)}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          item.status === s ? (
                                            s === 'to-watch' ? "bg-neon-cyan text-black glow-cyan" :
                                              s === 'watching' ? "bg-neon-magenta text-black glow-magenta" :
                                                "bg-neon-lime text-black glow-lime"
                                          ) : "hover:bg-white/10 text-gray-500"
                                        )}
                                        title={s.replace('-', ' ')}
                                      >
                                        {s === 'to-watch' ? <Clock className="w-4 h-4" /> :
                                          s === 'watching' ? <PlayCircle className="w-4 h-4" /> :
                                            <CheckCircle2 className="w-4 h-4" />}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteItem(item.id!)}
                                    className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {filteredList.filter(i => i.status === currentTab && (i.type === 'tv' || i.type === 'anime' as any)).length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-xl font-bold text-gray-700 dark:text-gray-400 flex items-center gap-2 pl-2">
                            <Tv className="w-5 h-5" /> {t('tvSeries')}
                          </h3>
                          <div className="space-y-3">
                            {filteredList.filter(i => i.status === currentTab && (i.type === 'tv' || i.type === 'anime' as any)).map((item) => (
                              <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between group hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                onClick={async (e) => {
                                  if ((e.target as HTMLElement).closest('button')) return;
                                  setIsSearching(true);
                                  const result = item.tmdbId
                                    ? await getFilmDetailsById(item.tmdbId, item.type === 'tv' ? 'tv' : 'movie', language)
                                    : await searchFilm(item.title, language);
                                  if (result) {
                                    setSearchResult(result);
                                    setShowDetail(true);
                                  }
                                  setIsSearching(false);
                                }}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="p-3 rounded-xl bg-neon-magenta/20 text-neon-magenta">
                                    <Tv className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">{item.title}</h3>
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                                      {item.releaseYear && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded">{item.releaseYear}</span>}
                                      {item.duration && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded">{item.duration}</span>}
                                      {item.platform && <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded uppercase tracking-wider">{item.platform}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {STATUSES.map(s => (
                                      <button
                                        key={s}
                                        onClick={() => handleUpdateStatus(item.id!, s)}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          item.status === s ? (
                                            s === 'to-watch' ? "bg-neon-cyan text-black glow-cyan" :
                                              s === 'watching' ? "bg-neon-magenta text-black glow-magenta" :
                                                "bg-neon-lime text-black glow-lime"
                                          ) : "hover:bg-white/10 text-gray-500"
                                        )}
                                        title={s.replace('-', ' ')}
                                      >
                                        {s === 'to-watch' ? <Clock className="w-4 h-4" /> :
                                          s === 'watching' ? <PlayCircle className="w-4 h-4" /> :
                                            <CheckCircle2 className="w-4 h-4" />}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteItem(item.id!)}
                                    className="p-2 text-gray-600 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="bg-gradient-to-br from-orange-50 to-white dark:from-neon-orange/20 dark:to-black border border-orange-200 dark:border-neon-orange/30 rounded-3xl p-8 relative overflow-hidden dark:glow-orange">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Sparkles className="w-32 h-32 text-orange-500 dark:text-white" />
                </div>
                <h3 className="text-2xl font-bold mb-4 flex items-center gap-2 text-orange-600 dark:text-glow-orange dark:text-white">
                  <Sparkles className="w-6 h-6 text-orange-500 dark:text-neon-orange" />
                  {t('aiMoodSuggestion')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-lg">
                  {t('moodPrompt')}
                </p>
                <div className="space-y-6">
                  <textarea
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    placeholder={t('moodPlaceholder')}
                    className="w-full bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-lg text-gray-900 dark:text-white focus:border-orange-500 dark:focus:border-neon-orange outline-none transition-all resize-none h-32 focus:ring-4 focus:ring-orange-100 dark:focus:ring-0 dark:focus:glow-orange"
                  />
                  <button
                    onClick={handleGetRec}
                    disabled={isRecLoading || !mood.trim()}
                    className="w-full bg-orange-500 hover:bg-orange-600 dark:bg-neon-orange dark:hover:bg-neon-orange/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-xl dark:glow-orange"
                  >
                    {isRecLoading ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        {t('getSuggestion')}
                      </>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {recommendation && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-8 pt-8 border-t border-gray-200 dark:border-white/10"
                    >
                      <div className="prose dark:prose-invert prose-lg max-w-none text-gray-800 dark:text-gray-200">
                        <ReactMarkdown>{recommendation}</ReactMarkdown>
                      </div>
                      <button
                        onClick={() => setRecommendation(null)}
                        className="mt-6 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        {t('clearSuggestion')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Stats in Suggestions view */}
              <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-3xl p-8">
                <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">{t('progress')}</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-black/40 p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
                    <div className="text-4xl font-bold text-orange-500">{watchlist.length}</div>
                    <div className="text-sm text-gray-500 uppercase tracking-wider mt-1">{t('totalItems')}</div>
                  </div>
                  <div className="bg-white dark:bg-black/40 p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none">
                    <div className="text-4xl font-bold text-green-500">
                      {watchlist.filter(i => i.status === 'watched').length}
                    </div>
                    <div className="text-sm text-gray-500 uppercase tracking-wider mt-1">{t('completed')}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navbar */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#050505]/90 backdrop-blur-xl border-t px-4 py-4 transition-colors duration-500",
        currentTab === 'to-watch' ? "border-cyan-500/30 dark:border-neon-cyan/30" :
          currentTab === 'watching' ? "border-fuchsia-500/30 dark:border-neon-magenta/30" :
            currentTab === 'watched' ? "border-green-500/30 dark:border-neon-lime/30" :
              "border-orange-500/30 dark:border-neon-orange/30"
      )}>
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setCurrentTab('to-watch')}
            className={cn(
               "flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl",
               currentTab === 'to-watch' ? "text-cyan-600 dark:text-neon-cyan dark:text-glow-cyan scale-110 bg-cyan-50 dark:bg-neon-cyan/10" : "text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
            )}
          >
            <Clock className="w-6 h-6" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t('toWatch')}</span>
          </button>

          <button
            onClick={() => setCurrentTab('watching')}
            className={cn(
               "flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl",
               currentTab === 'watching' ? "text-fuchsia-600 dark:text-neon-magenta dark:text-glow-magenta scale-110 bg-fuchsia-50 dark:bg-neon-magenta/10" : "text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
            )}
          >
            <PlayCircle className="w-6 h-6" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t('watching')}</span>
          </button>

          <button
            onClick={() => setCurrentTab('watched')}
            className={cn(
               "flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl",
               currentTab === 'watched' ? "text-green-600 dark:text-neon-lime dark:text-glow-lime scale-110 bg-green-50 dark:bg-neon-lime/10" : "text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
            )}
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t('watched')}</span>
          </button>

          <div className="w-px h-8 bg-gray-200 dark:bg-white/10 mx-1" />

          <button
            onClick={() => setCurrentTab('suggestions')}
            className={cn(
               "flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl",
               currentTab === 'suggestions' ? "text-orange-600 dark:text-neon-orange dark:text-glow-orange scale-110 bg-orange-50 dark:bg-neon-orange/10" : "text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
            )}
          >
            <Sparkles className="w-6 h-6" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t('suggestions')}</span>
          </button>

          <button
            onClick={() => setCurrentTab('profile')}
            className={cn(
               "flex flex-col items-center gap-1 transition-all px-3 py-1 rounded-xl",
               currentTab === 'profile' ? "text-blue-600 dark:text-blue-400 scale-110 bg-blue-50 dark:bg-blue-400/10 dark:drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" : "text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white"
            )}
          >
            <User className="w-6 h-6" />
            <span className="text-[8px] font-bold uppercase tracking-widest">{t('profile')}</span>
          </button>
        </div>
      </nav>

      {/* Film Detail Modal (Netflix Style) */}
      <AnimatePresence>
        {showDetail && searchResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDetail(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative bg-[#141414] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-none sm:rounded-2xl shadow-2xl border border-white/10"
            >
              <button
                onClick={() => {
                  setShowDetail(false);
                  setSearchResult(null);
                  setSearchQuery('');
                }}
                className="absolute top-6 right-6 z-50 p-2 bg-gray-200 hover:bg-gray-300 dark:bg-black/50 dark:hover:bg-black/80 text-gray-700 dark:text-white rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Hero Section */}
              <div className="relative h-[300px] sm:h-[450px] w-full">
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#141414] via-transparent to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-r from-white dark:from-[#141414] via-white/50 dark:via-[#141414]/50 to-transparent z-10" />

                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-white/5">
                  {searchResult.posterUrl && (
                    <img
                      src={searchResult.posterUrl}
                      alt={searchResult.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>

                <div className="absolute bottom-0 left-0 p-8 sm:p-12 z-20 max-w-2xl">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h1 className="text-4xl sm:text-6xl font-black mb-4 tracking-tighter uppercase text-gray-900 dark:text-neon-cyan dark:text-glow-cyan">{searchResult.title}</h1>
                    <div className="flex items-center gap-4 text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                      <span className="text-green-600 dark:text-neon-lime font-bold dark:text-glow-lime">98% {t('match')}</span>
                      <span>{searchResult.releaseYear}</span>
                      <span className="border border-gray-300 dark:border-white/30 px-1.5 py-0 rounded text-[10px]">{searchResult.rating || '13+'}</span>
                      <span>{searchResult.duration}</span>
                      <span className="bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded text-[10px] uppercase">{searchResult.type === 'tv' ? t('tvSeries') : t('films')}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4 italic">
                      * Streaming availability may vary by region.
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200 line-clamp-3 mb-8 leading-relaxed">
                      {searchResult.summary}
                    </p>
                  </motion.div>
                </div>
              </div>

              {/* Details Content */}
              <div className="p-8 sm:p-12 grid grid-cols-1 md:grid-cols-3 gap-12">
                <div className="md:col-span-2 space-y-8">
                  <div>
                    <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      {t('summary')}
                    </h3>
                    <p className="text-gray-800 dark:text-gray-300 leading-relaxed text-lg">
                      {searchResult.summary}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Tags className="w-4 h-4" />
                      {t('genres')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {searchResult.genres.map(g => (
                        <span key={g} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 px-3 py-1 rounded-full text-sm text-gray-700 dark:text-gray-200">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                  {searchResult.sourceUrl && (
                    <div className="pt-4">
                      <a
                        href={searchResult.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange-600 dark:text-orange-500 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {t('source')}: {new URL(searchResult.sourceUrl).hostname}
                      </a>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {t('cast')}
                    </h3>
                    <div className="space-y-1">
                      {searchResult.cast.map(c => (
                        <div key={c} className="text-gray-800 dark:text-gray-300 text-sm">{c}</div>
                      ))}
                    </div>
                  </div>

                  {searchResult.director && (
                    <div>
                      <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                        {t('director')}
                      </h3>
                      <div className="text-gray-800 dark:text-gray-300 text-sm">{searchResult.director}</div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-gray-500 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      {t('availableOn')}
                    </h3>
                    <div className="space-y-3">
                      {searchResult.availability.map(avail => (
                        <div key={avail.platform} className="flex items-center justify-between group/item">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              avail.isAvailable ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-300 dark:bg-gray-700"
                            )} />
                            <span className={cn(
                              "text-sm font-medium",
                              avail.isAvailable ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"
                            )}>
                              {avail.platform}
                            </span>
                          </div>
                          {avail.isAvailable && (
                            <button
                              onClick={() => handleAddFromSearch(avail.platform as Platform)}
                              className="text-[10px] font-bold uppercase tracking-widest text-orange-500 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              {t('addToWatchlist')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Footer */}
      <footer className="max-w-4xl mx-auto p-6 text-center text-gray-600 text-xs border-t border-gray-200 dark:border-white/5 mt-12 mb-24">
        <p>© 2026 CineMood • Powered by Google Gemini</p>
      </footer>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}
