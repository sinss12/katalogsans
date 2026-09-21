'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';
import manualCovers from '@/data/manualCovers.json';

function generateDummyReviews(rating: number, genreName: string) {
  const positiveComments = [
    `Gameplay-nya seru banget, cocok buat penggemar genre ${genreName}.`,
    'Grafisnya oke dan ceritanya bikin penasaran terus.',
    'Worth it dimainkan, gak nyesel beli game ini.',
    'Kontrolnya smooth, gak ada lag berarti.',
  ];
  const neutralComments = [
    'Lumayan seru tapi ada beberapa bug kecil.',
    'Ceritanya standar aja tapi gameplay-nya lumayan.',
    'Bisa dimainin santai, cocok buat killing time.',
  ];
  const negativeComments = [
    'Kurang sesuai ekspektasi, banyak bug ganggu.',
    'Ceritanya kurang greget menurut saya.',
  ];

  const pool = rating >= 4 ? positiveComments : rating >= 2.5 ? neutralComments : negativeComments;
  const usernames = ['GamerLampung', 'SteamUser99', 'CasualPlayer', 'RPGLover21', 'IndieFan'];

  return Array.from({ length: 3 }, (_, i) => ({
    username: usernames[(i + Math.floor(rating * 10)) % usernames.length],
    comment: pool[i % pool.length],
    stars: Math.max(1, Math.min(5, Math.round(rating + (Math.random() - 0.5)))),
  }));
}

export default function Home() {
  // --- STATE UTAMA ---
  const [games, setGames] = useState<any[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('Semua');
  const [isLoading, setIsLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'trending' | 'az'>('default');

  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<any | null>(null);

  const alphabets = ['0-9', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

  // --- KOMPONEN BINTANG ---
  const StarRating = ({ rating }: { rating: number }) => {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex text-[12px]">
          {[1, 2, 3, 4, 5].map((star) => {
            const fillPercentage = Math.min(Math.max(rating - star + 1, 0), 1) * 100;
            return (
              <span key={star} className="relative text-slate-700">
                ★
                <span className="absolute left-0 top-0 overflow-hidden text-slate-300" style={{ width: `${fillPercentage}%` }}>★</span>
              </span>
            );
          })}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  // --- AMBIL DATA DARI SUPABASE ---
  useEffect(() => {
    let isMounted = true;

    // Fetch SEMUA baris dataset_raw dengan pagination, karena Supabase membatasi
    // hasil query ke 1000 baris per request secara default. Tanpa ini, data yang
    // idnya berada di luar batas tersebut tidak akan pernah muncul di katalog,
    // dan daftar genre yang muncul bisa berbeda dengan halaman admin.
    async function fetchData() {
      try {
        let allGames: any[] = [];
        let from = 0;
        const batchSize = 1000;
        let keepGoing = true;

        while (keepGoing) {
          const { data: batch, error, status } = await supabase
            .from('dataset_raw')
            .select('*')
            .range(from, from + batchSize - 1);

          if (error) {
            const detailError = JSON.stringify(error, Object.getOwnPropertyNames(error));
            console.error("DETAIL ERROR ASLI SUPABASE:", detailError);
            const errMsg = error.message || error.details || `Error Code: ${error.code} | Status HTTP: ${status}`;
            alert(`Gagal mengambil data dari database: ${errMsg}`);
            if (isMounted) setIsLoading(false);
            return;
          }

          if (batch && batch.length > 0) {
            allGames = allGames.concat(batch);
            from += batchSize;
            keepGoing = batch.length === batchSize;
          } else {
            keepGoing = false;
          }
        }

        const gamesData = allGames;

        if (isMounted && gamesData) {
          // Disamakan dengan logic admin: sorted, dari genre_name, filter yang kosong
          const uniqueGenres = Array.from(
            new Set(gamesData.map((g: any) => g.genre_name).filter(Boolean))
          ).sort() as string[];
          setGenres(uniqueGenres);

          const formatted = gamesData.map((game: any) => {
            const dynamicCover = `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(game.title)}&font=montserrat`;
            const isManuallySetInDb = game.image_url && !game.image_url.includes('unsplash.com');
            const overrideFromJson = (manualCovers as Record<string, string>)[game.title];
            const gameRating = parseFloat(game.rating) || 5.0;

            // Prioritas: 1) cover yang udah diedit manual di Supabase, 2) override dari manualCovers.json, 3) placeholder text otomatis
            const finalImageUrl = isManuallySetInDb
              ? game.image_url
              : (overrideFromJson || dynamicCover);

            return {
              id: game.id,
              title: game.title,
              genreName: game.genre_name || 'Umum',
              rating: gameRating,
              isTrending: gameRating >= 4.5,
              clusterId: game.cluster_id,
              description: `Game bergenre ${game.genre_name || 'Umum'} dengan rating ${gameRating.toFixed(1)} dari pengguna.`,
              imageUrl: finalImageUrl
            };
          });
          setGames(formatted);
        }
      } catch (err: any) {
        const errorMsg = err?.message || JSON.stringify(err);
        console.error("Catch Error:", errorMsg);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    fetchData();

    return () => { isMounted = false; };
  }, []);

  // --- LOGIKA FILTER & SORTING ---
  let displayedGames = selectedGenre === 'Semua'
    ? [...games]
    : games.filter(g => g.genreName && g.genreName.toLowerCase() === selectedGenre.toLowerCase());

  if (sortMode === 'az' && selectedLetter) {
    displayedGames = displayedGames.filter(g => {
      const firstChar = g.title.charAt(0).toUpperCase();
      if (selectedLetter === '0-9') {
        return /[0-9]/.test(firstChar);
      }
      return firstChar === selectedLetter;
    });
  }

  if (searchQuery.trim() !== '') {
    const q = searchQuery.trim().toLowerCase();
    displayedGames = displayedGames.filter(g =>
      g.title.toLowerCase().includes(q) ||
      (g.genreName && g.genreName.toLowerCase().includes(q))
    );
  }

  if (sortMode === 'trending') {
    displayedGames.sort((a, b) => b.rating - a.rating);
  } else if (sortMode === 'az') {
    displayedGames.sort((a, b) => a.title.localeCompare(b.title));
  }

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
      <div className="w-12 h-12 border-4 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
      <h1 className="text-slate-400 text-sm font-semibold tracking-widest">MEMUAT KATALOG...</h1>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 pb-24 font-sans relative overflow-hidden">
      {/* HEADER NAVIGASI */}
      <header className="bg-slate-900 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16 gap-4">
          <Link href="/" className="text-lg font-bold text-slate-100 tracking-wide flex items-center shrink-0">
            KATALOGSANS
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 shrink-0">
            <button onClick={() => { setSortMode('default'); setSelectedGenre('Semua'); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'default' ? 'text-slate-100' : ''}`}>Home</button>

            <div className="relative">
              <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="hover:text-slate-100 flex items-center gap-1 transition-colors">
                Categories ▾
              </button>
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-800 shadow-xl rounded-md overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                  <button onClick={() => {setSelectedGenre('Semua'); setIsDropdownOpen(false); setSortMode('default'); setSelectedLetter(null);}} className="block w-full text-left px-4 py-3 hover:bg-slate-800 text-xs font-semibold border-b border-slate-800">SEMUA</button>
                  {genres.map((gName, index) => (
                    <button key={index} onClick={() => {setSelectedGenre(gName); setIsDropdownOpen(false); setSortMode('default'); setSelectedLetter(null);}} className="block w-full text-left px-4 py-2 hover:bg-slate-800 text-xs uppercase text-slate-400">
                      {gName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setSortMode('trending'); setSelectedGenre('Semua'); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'trending' ? 'text-slate-100' : ''}`}>Top Games</button>
            <button onClick={() => { setSortMode('az'); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'az' ? 'text-slate-100' : ''}`}>Game List</button>
          </nav>

          {/* INPUT SEARCH */}
          <div className="flex items-center flex-1 max-w-xs ml-auto">
            <div className="relative w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul atau genre..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-9 pr-8 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 text-xs transition-colors"
                  aria-label="Hapus pencarian"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <div className="max-w-6xl mx-auto px-6 pt-10 relative z-10">
        <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60 p-10 md:p-12 shadow-sm">
          <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-full text-[10px] font-semibold tracking-widest uppercase mb-4 inline-block">
            {sortMode === 'trending' ? 'TRENDING SAAT INI' : sortMode === 'az' ? 'DAFTAR LENGKAP A-Z' : 'REKOMENDASI TERBAIK'}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-slate-100 tracking-tight">
            KatalogSans
          </h1>
          <p className="text-slate-500 text-sm max-w-lg leading-relaxed">
            Temukan game terbaik dari koleksi katalog kami. Jelajahi berdasarkan genre, rating, atau cari langsung judul yang kamu inginkan.
          </p>
        </div>
      </div>

      {/* FILTER ABJAD (Hanya Muncul Saat 'Game List') */}
      {sortMode === 'az' && (
        <div className="max-w-6xl mx-auto px-6 pt-8 relative z-10">
          <div className="flex flex-wrap gap-2 justify-center bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <button
              onClick={() => setSelectedLetter(null)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${!selectedLetter ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60'}`}
            >
              ALL
            </button>
            {alphabets.map(letter => (
              <button
                key={letter}
                onClick={() => setSelectedLetter(letter)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors min-w-[32px] text-center ${selectedLetter === letter ? 'bg-slate-700 text-slate-100' : 'bg-slate-800 text-slate-400 hover:bg-slate-700/60'}`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* INDIKATOR HASIL SEARCH */}
      {searchQuery.trim() !== '' && (
        <div className="max-w-6xl mx-auto px-6 pt-8 relative z-10">
          <p className="text-xs text-slate-500">
            Menampilkan <span className="text-slate-300 font-semibold">{displayedGames.length}</span> hasil untuk "
            <span className="text-slate-200 font-semibold">{searchQuery}</span>"
          </p>
        </div>
      )}

      {/* KATALOG GAME GRID */}
      <div className="max-w-6xl mx-auto px-6 pt-10 relative z-10">
        {displayedGames.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-6">
            {displayedGames.map((game, index) => (
              <div
                key={game.id || index}
                onClick={() => setSelectedGame(game)}
                className="group bg-slate-900 border border-slate-800 rounded-lg overflow-hidden hover:border-slate-600 transition-all duration-300 shadow-sm transform hover:-translate-y-1 cursor-pointer"
              >
                {/* Bagian Gambar + Badge */}
                <div className="h-48 relative overflow-hidden bg-slate-950 flex flex-col justify-between p-3">
                  <img
                    src={game.imageUrl}
                    alt={game.title}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent"></div>

                  <div className="z-10 self-end ml-auto">
                    {game.isTrending ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-widest uppercase bg-slate-700 text-slate-100 rounded-md shadow-sm">
                        ★ POPULER
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Bagian Informasi Teks */}
                <div className="p-4 flex flex-col h-[140px]">
                  <h3 className="font-semibold text-base mb-1 truncate text-slate-200 group-hover:text-slate-100 transition-colors">
                    {game.title}
                  </h3>
                  <p className="text-[11px] line-clamp-3 mb-3 leading-relaxed text-slate-500">
                    {game.description}
                  </p>

                  <div className="flex items-center justify-between mt-auto border-t border-slate-800 pt-3">
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-md uppercase tracking-wider max-w-[100px] truncate">
                      {game.genreName}
                    </span>
                    <StarRating rating={game.rating} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
            <span className="text-4xl block mb-2 opacity-60">🔍</span>
            <p className="text-slate-500 font-medium text-sm">
              {searchQuery.trim() !== ''
                ? `Tidak ada game yang cocok dengan "${searchQuery}".`
                : 'Tidak ada game ditemukan untuk pencarian ini.'}
            </p>
          </div>
        )}
      </div>

      {/* MODAL DETAIL GAME */}
      {selectedGame && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setSelectedGame(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-56">
              <img
                src={selectedGame.imageUrl}
                alt={selectedGame.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent"></div>
              <button
                onClick={() => setSelectedGame(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-slate-950/70 hover:bg-slate-800 rounded-full text-slate-300 text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-xl font-bold text-slate-100">{selectedGame.title}</h2>
                {selectedGame.isTrending && (
                  <span className="shrink-0 px-2 py-0.5 text-[9px] font-semibold tracking-widest uppercase bg-slate-700 text-slate-100 rounded-md">
                    ★ POPULER
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {selectedGame.genreName}
                </span>
                <StarRating rating={selectedGame.rating} />
              </div>

              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                {selectedGame.description}
              </p>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold text-slate-200 mb-3">Ulasan Pengguna</h3>
                <div className="space-y-3">
                  {generateDummyReviews(selectedGame.rating, selectedGame.genreName).map((review, i) => (
                    <div key={i} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-300">{review.username}</span>
                        <StarRating rating={review.stars} />
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}