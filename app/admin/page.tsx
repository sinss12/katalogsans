'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/utils/supabase';
import manualCovers from '@/data/manualCovers.json';

type DataPoint = { id: number; features: number[]; cluster: number };

const SUPER_GENRE_MAP: { [key: string]: string } = {
  'action': 'ACTION', 'shooter': 'ACTION', 'fighting': 'ACTION', 'hack and slash': 'ACTION',
  'strategy': 'STRATEGY', 'rts': 'STRATEGY', 'tactical': 'STRATEGY',
  'rpg': 'RPG', 'mmorpg': 'RPG',
  'simulation': 'SIMULATION_SPORTS', 'sports': 'SIMULATION_SPORTS', 'racing': 'SIMULATION_SPORTS',
  'adventure': 'ADVENTURE_NARRATIVE', 'puzzle': 'ADVENTURE_NARRATIVE', 'visual novel': 'ADVENTURE_NARRATIVE',
};
const SUPER_GENRE_LIST = ['ACTION', 'STRATEGY', 'RPG', 'SIMULATION_SPORTS', 'ADVENTURE_NARRATIVE', 'GENERAL'];

function resolveSuperGenre(genreName: string) {
  if (!genreName) return 'GENERAL';
  const lower = genreName.toLowerCase();
  for (const [key, val] of Object.entries(SUPER_GENRE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'GENERAL';
}

function euclidean(a: number[], b: number[]) {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

function prepareDataPoints(rawData: any[]): DataPoint[] {
  const ratings = rawData.map((d: any) => parseFloat(d.rating) || 0);
  const meanRating = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
  const stdRating = Math.sqrt(
    ratings.reduce((a: number, b: number) => a + Math.pow(b - meanRating, 2), 0) / ratings.length
  ) || 1;

  return rawData.map((d: any) => {
    const superGenre = resolveSuperGenre(d.genre_name);
    const oneHot = SUPER_GENRE_LIST.map(g => (g === superGenre ? 1 : 0));
    const zRating = ((parseFloat(d.rating) || 0) - meanRating) / stdRating;
    return { id: d.id, features: [...oneHot, zRating], cluster: 0 };
  });
}

function initializeCentroids(dataPoints: DataPoint[], k: number): number[][] {
  if (k <= 1) {
    const dims = dataPoints[0].features.length;
    const mean = Array(dims).fill(0);
    dataPoints.forEach(p => p.features.forEach((v, d) => { mean[d] += v; }));
    for (let d = 0; d < dims; d++) mean[d] /= dataPoints.length;
    return [mean];
  }

  let centroids: number[][] = [dataPoints[0].features];
  while (centroids.length < k) {
    let farthestPoint = dataPoints[0];
    let farthestDist = -1;
    dataPoints.forEach(p => {
      const minDistToCentroids = Math.min(...centroids.map(c => euclidean(p.features, c)));
      if (minDistToCentroids > farthestDist) {
        farthestDist = minDistToCentroids;
        farthestPoint = p;
      }
    });
    centroids.push(farthestPoint.features);
  }
  return centroids;
}

function runKMeansCore(dataPoints: DataPoint[], k: number, maxIter = 100, threshold = 0.0001) {
  let centroids = initializeCentroids(dataPoints, k);
  let iterCount = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterCount = iter + 1;

    dataPoints.forEach(p => {
      let minDist = Infinity;
      centroids.forEach((c, idx) => {
        const dist = euclidean(p.features, c);
        if (dist < minDist) { minDist = dist; p.cluster = idx; }
      });
    });

    let maxShift = 0;
    const newCentroids = centroids.map((c, idx) => {
      const clusterPoints = dataPoints.filter(p => p.cluster === idx);
      if (clusterPoints.length === 0) return c;
      const dims = c.length;
      const newC = Array(dims).fill(0);
      clusterPoints.forEach(p => p.features.forEach((v, d) => { newC[d] += v; }));
      for (let d = 0; d < dims; d++) newC[d] /= clusterPoints.length;
      maxShift = Math.max(maxShift, euclidean(c, newC));
      return newC;
    });

    centroids = newCentroids;
    if (maxShift < threshold) break;
  }

  return { points: dataPoints, centroids, iterations: iterCount };
}

function calculateWCSS(points: DataPoint[], centroids: number[][]) {
  return points.reduce((sum, p) => sum + Math.pow(euclidean(p.features, centroids[p.cluster]), 2), 0);
}

function calculateDBI(points: DataPoint[], centroids: number[][]) {
  const k = centroids.length;
  const clusterScatter: number[] = [];

  for (let i = 0; i < k; i++) {
    const members = points.filter(p => p.cluster === i);
    if (members.length === 0) { clusterScatter.push(0); continue; }
    const avgDist = members.reduce((sum, p) => sum + euclidean(p.features, centroids[i]), 0) / members.length;
    clusterScatter.push(avgDist);
  }

  let dbiSum = 0;
  for (let i = 0; i < k; i++) {
    let maxRatio = -Infinity;
    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      const centroidDist = euclidean(centroids[i], centroids[j]);
      if (centroidDist === 0) continue;
      const ratio = (clusterScatter[i] + clusterScatter[j]) / centroidDist;
      if (ratio > maxRatio) maxRatio = ratio;
    }
    dbiSum += maxRatio === -Infinity ? 0 : maxRatio;
  }
  return dbiSum / k;
}

function GameCard({ game, onClick }: { game: any; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-sm hover:border-slate-600 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative"
    >
      <div className="absolute top-2 left-2 z-20 bg-slate-950/90 border border-slate-700 text-[9px] text-slate-300 px-2 py-0.5 rounded font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
        EDIT CARD
      </div>

      <div className="h-48 w-full relative overflow-hidden bg-slate-950 flex flex-col justify-between p-3">
        <img
          src={game.imageUrl}
          alt={game.title}
          className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
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

      <div className="p-4 relative flex flex-col h-[140px]">
        <h3 className="font-semibold text-base tracking-wide text-slate-200 group-hover:text-slate-100 transition-colors truncate mb-1">
          {game.title}
        </h3>
        <p className="text-[11px] mb-3 line-clamp-3 leading-relaxed text-slate-500">
          {game.description}
        </p>

        <div className="flex items-center justify-between mt-auto border-t border-slate-800 pt-3">
          <span className="inline-block text-[10px] uppercase font-semibold tracking-wider text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-md truncate max-w-[100px]">
            {game.genreName}
          </span>

          <div className="flex items-center gap-1">
            <div className="flex text-[12px]">
              {[1, 2, 3, 4, 5].map((star) => {
                const fillPercentage = Math.min(Math.max(game.rating - star + 1, 0), 1) * 100;
                return (
                  <span key={star} className="relative text-slate-700">
                    ★
                    <span className="absolute left-0 top-0 overflow-hidden text-slate-300" style={{ width: `${fillPercentage}%` }}>★</span>
                  </span>
                );
              })}
            </div>
            <span className="text-[11px] font-semibold text-slate-400">{Number(game.rating).toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [games, setGames] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('Semua');
  const [isLoading, setIsLoading] = useState(true);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'trending' | 'az'>('default');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);

  const alphabets = ['0-9', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

  const [newGenre, setNewGenre] = useState('');
  const [title, setTitle] = useState('');
  const [genreId, setGenreId] = useState('');
  const [rating, setRating] = useState(5.0);
  const [isTrending, setIsTrending] = useState(false);
  const [imagePath, setImagePath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editGenreId, setEditGenreId] = useState('');
  const [editImagePath, setEditImagePath] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRating, setEditRating] = useState(5.0);
  const [isUpdating, setIsUpdating] = useState(false);

  const [isClustering, setIsClustering] = useState(false);
  const [lastDbi, setLastDbi] = useState<number | null>(null);
  const [lastIterations, setLastIterations] = useState<number | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [selectedK, setSelectedK] = useState(3);

  const [elbowResults, setElbowResults] = useState<{ k: number; wcss: number }[]>([]);
  const [isRunningElbow, setIsRunningElbow] = useState(false);

  const availableGenreNames = Array.from(
    new Set([
      ...genres.map((g) => g.name),
      ...games.map((g) => g.genreName)
    ])
  ).filter(Boolean).sort();

  // Fetch SEMUA baris dataset_raw dengan pagination, karena Supabase membatasi
  // hasil query ke 1000 baris per request secara default. Tanpa ini, data yang
  // idnya berada di luar 1000 baris pertama tidak akan pernah muncul di web.
  async function fetchData() {
    try {
      let allGames: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let keepGoing = true;

      while (keepGoing) {
        const { data: batch, error } = await supabase
          .from('dataset_raw')
          .select('*')
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allGames = allGames.concat(batch);
          from += batchSize;
          keepGoing = batch.length === batchSize;
        } else {
          keepGoing = false;
        }
      }

      const gamesData = allGames;

      const uniqueGenres = Array.from(
        new Set(gamesData.map((g: any) => g.genre_name).filter(Boolean))
      ).sort();
      setGenres(uniqueGenres.map((name, i) => ({ id: i, name })));

      const formatted = gamesData.map((game: any) => {
        const dynamicCover = `https://placehold.co/600x400/1e293b/94a3b8?text=${encodeURIComponent(game.title)}&font=montserrat`;
        const isManuallySetInDb = game.image_url && !game.image_url.includes('unsplash.com');
        const overrideFromJson = (manualCovers as Record<string, string>)[game.title];
        const gameRating = parseFloat(game.rating) || 5.0;

        const finalImageUrl = isManuallySetInDb
          ? game.image_url
          : (overrideFromJson || dynamicCover);

        return {
          id: game.id,
          title: game.title,
          genreName: game.genre_name || 'Umum',
          rating: gameRating,
          isTrending: gameRating >= 4.5,
          description: `Game bergenre ${game.genre_name || 'Umum'} dengan rating ${gameRating.toFixed(1)} dari pengguna.`,
          imageUrl: finalImageUrl,
          clusterId: game.cluster_id
        };
      });

      setGames(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    const confirmLogout = window.confirm('Yakin ingin keluar dari Admin Panel?');
    if (!confirmLogout) return;

    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  const handleAddGenre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGenre) return;

    const isDuplicate = availableGenreNames.some(
      (name) => name.toLowerCase() === newGenre.toLowerCase().trim()
    );
    if (isDuplicate) {
      alert("Tidak bisa ditambahkan karena sudah ada");
      return;
    }

    setGenres((prev) => [...prev, { id: `local-${Date.now()}`, name: newGenre.toUpperCase() }]);
    alert(`Genre "${newGenre.toUpperCase()}" ditambahkan ke daftar pilihan. Gunakan genre ini pada minimal satu game supaya tersimpan permanen.`);
    setNewGenre('');
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setIsSubmitting(true);

    const selectedGenreName = genreId || 'General';

    let formattedPath = imagePath.trim();
    if (formattedPath && !formattedPath.startsWith('http') && !formattedPath.startsWith('/')) {
      formattedPath = '/' + formattedPath;
    }

    const { error } = await supabase
      .from('dataset_raw')
      .insert([{
          title: title,
          genre_name: selectedGenreName,
          rating: rating,
          image_url: formattedPath || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=500'
      }]);

    setIsSubmitting(false);

    if (error) {
      alert(`Gagal menyimpan objek dataset: ${error.message}`);
    } else {
      alert(`Sukses! Game "${title}" berhasil ditambahkan ke dataset mentah!`);
      setTitle('');
      setImagePath('');
      setRating(5);
      setGenreId('');
      setSelectedGenre('Semua');
      setSortMode('default');
      setSearchQuery('');
      setSelectedLetter(null);
      fetchData();
    }
  };

  const handleOpenEditModal = (game: any) => {
    setSelectedGame(game);
    setEditTitle(game.title);
    setEditGenreId(game.genreName || '');
    setEditImagePath(game.imageUrl);
    setEditDescription(game.description);
    setEditRating(game.rating);
  };

  const handleSaveChanges = async () => {
    if (!selectedGame || !editTitle) return;
    setIsUpdating(true);

    const selectedGenreName = editGenreId || selectedGame.genreName;
    let formattedPath = editImagePath.trim();
    if (formattedPath && !formattedPath.startsWith('http') && !formattedPath.startsWith('/')) {
      formattedPath = '/' + formattedPath;
    }

    const { error } = await supabase
      .from('dataset_raw')
      .update({
        title: editTitle.trim(),
        genre_name: selectedGenreName,
        image_url: formattedPath || null,
        rating: editRating
      })
      .eq('id', selectedGame.id);

    setIsUpdating(false);

    if (error) {
      alert(`Gagal memperbarui data: ${error.message}`);
    } else {
      alert(`Sukses memperbarui data game ${editTitle}!`);
      setSelectedGame(null);
      fetchData();
    }
  };

  const handleDeleteGame = async () => {
    if (!selectedGame) return;
    const confirmDelete = window.confirm(`Peringatan: Yakin ingin menghapus permanen game "${selectedGame.title}"?`);
    if (!confirmDelete) return;

    setIsUpdating(true);
    const { error } = await supabase.from('dataset_raw').delete().eq('id', selectedGame.id);
    setIsUpdating(false);

    if (error) {
      alert(`Gagal menghapus game: ${error.message}`);
    } else {
      alert(`Game ${selectedGame.title} berhasil dihapus dari database!`);
      setSelectedGame(null);
      fetchData();
    }
  };

  const runElbowMethod = async () => {
    setIsRunningElbow(true);
    try {
      const { data: rawData, error } = await supabase.from('dataset_raw').select('*');

      if (error || !rawData) throw error;
      if (rawData.length === 0) {
        alert("Data dataset_raw kosong! Pastikan CSV sudah diimport dengan benar.");
        setIsRunningElbow(false);
        return;
      }

      const baseDataPoints = prepareDataPoints(rawData);
      const maxK = Math.min(8, rawData.length);
      const results: { k: number; wcss: number }[] = [];

      for (let k = 1; k <= maxK; k++) {
        const clonedPoints = baseDataPoints.map(p => ({ ...p, features: [...p.features], cluster: 0 }));
        const { points, centroids } = runKMeansCore(clonedPoints, k);
        const wcss = calculateWCSS(points, centroids);
        results.push({ k, wcss });
      }

      setElbowResults(results);
    } catch (err: any) {
      alert(`Error Metode Elbow: ${err.message}`);
    } finally {
      setIsRunningElbow(false);
    }
  };

  const runKMeans = async () => {
    setIsClustering(true);
    try {
      const { data: rawData, error } = await supabase.from('dataset_raw').select('*');

      if (error || !rawData) throw error;
      if (rawData.length === 0) {
        alert("Data dataset_raw kosong! Pastikan CSV sudah diimport dengan benar.");
        setIsClustering(false);
        return;
      }

      const dataPoints = prepareDataPoints(rawData);
      const { points, centroids, iterations } = runKMeansCore(dataPoints, selectedK);
      const dbiScore = calculateDBI(points, centroids);

      const chunkSize = 500;
      for (let i = 0; i < points.length; i += chunkSize) {
        const chunk = points.slice(i, i + chunkSize);
        await Promise.all(chunk.map(p =>
          supabase.from('dataset_raw').update({ cluster_id: p.cluster }).eq('id', p.id)
        ));
      }

      setLastDbi(dbiScore);
      setLastIterations(iterations);
      setLastRunAt(new Date().toLocaleString('id-ID'));

      alert(`PROSES DATA MINING SELESAI!\nK = ${selectedK}\nKonvergen dalam ${iterations} iterasi.\nDavies-Bouldin Index: ${dbiScore.toFixed(4)} (semakin kecil semakin baik)`);

      fetchData();

    } catch (err: any) {
      alert(`Error K-Means: ${err.message}`);
    } finally {
      setIsClustering(false);
    }
  };

  let displayedGames = selectedGenre === 'Semua'
    ? [...games]
    : games.filter(g => g.genreName && g.genreName.toLowerCase() === selectedGenre.toLowerCase());

  if (sortMode === 'az' && selectedLetter) {
    displayedGames = displayedGames.filter(g => {
      const firstChar = g.title.trim().charAt(0).toUpperCase();
      if (selectedLetter === '0-9') {
        return /[0-9]/.test(firstChar);
      }
      return firstChar === selectedLetter;
    });
  }

  if (searchQuery.trim()) {
    displayedGames = displayedGames.filter(g =>
      g.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );
  }

  if (sortMode === 'trending') {
    displayedGames.sort((a, b) => b.rating - a.rating);
  } else if (sortMode === 'az') {
    displayedGames.sort((a, b) => a.title.localeCompare(b.title));
  }

  const maxWcss = elbowResults.length > 0 ? Math.max(...elbowResults.map(r => r.wcss)) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 border-4 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
        <h1 className="text-slate-400 text-sm font-semibold tracking-widest">MEMUAT DATA K-MEANS...</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans relative overflow-hidden pb-24">
      <header className="bg-slate-900 border-b border-slate-800 shadow-sm sticky top-0 z-[60]">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16 gap-4">
          <Link href="/" className="text-lg font-bold text-slate-100 tracking-wide flex items-center shrink-0">
            KATALOGSANS
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 shrink-0">
            <button onClick={() => { setSortMode('default'); setSelectedGenre('Semua'); setSearchQuery(''); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'default' ? 'text-slate-100' : ''}`}>Home</button>

            <div className="relative">
              <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="hover:text-slate-100 flex items-center gap-1 transition-colors">
                Categories ▾
              </button>
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-slate-900 border border-slate-800 shadow-xl rounded-md overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                  <button onClick={() => {setSelectedGenre('Semua'); setIsDropdownOpen(false); setSortMode('default'); setSelectedLetter(null);}} className="block w-full text-left px-4 py-3 hover:bg-slate-800 text-xs font-semibold border-b border-slate-800">SEMUA</button>
                  {Array.from(new Set(games.map(g => g.genreName))).map((gName, i) => (
                    <button key={i} onClick={() => {setSelectedGenre(gName as string); setIsDropdownOpen(false); setSortMode('default'); setSelectedLetter(null);}} className="block w-full text-left px-4 py-2 hover:bg-slate-800 text-xs uppercase text-slate-400">
                      {gName as string}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setSortMode('trending'); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'trending' ? 'text-slate-100' : ''}`}>Top Games</button>
            <button onClick={() => { setSortMode('az'); setSelectedLetter(null); }} className={`hover:text-slate-100 transition-colors ${sortMode === 'az' ? 'text-slate-100' : ''}`}>Game List</button>
          </nav>

          <div className="flex items-center gap-3 flex-1 max-w-xs ml-auto">
            <div className="relative w-full">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul game..."
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

            <button
              onClick={handleLogout}
              className="shrink-0 px-3 py-2 bg-slate-800 hover:bg-red-950/50 text-slate-400 hover:text-red-400 text-[11px] font-semibold rounded-lg border border-slate-700 hover:border-red-900/50 transition-colors uppercase tracking-wide"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-10 relative z-10">

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">
              Central Control Panel
            </h1>
            <p className="text-slate-500 text-xs mt-1">Manipulasi matriks data latih untuk clustering algoritma K-Means secara real-time</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <label className="text-[9px] text-slate-500 uppercase font-semibold tracking-widest mb-1">Nilai K</label>
              <input
                type="number"
                min={1}
                max={8}
                value={selectedK}
                onChange={(e) => setSelectedK(Math.max(1, Math.min(8, Number(e.target.value))))}
                className="w-16 p-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-center text-slate-200 focus:outline-none focus:border-slate-500"
              />
            </div>
            <button
              onClick={runKMeans}
              disabled={isClustering}
              className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-6 py-3 rounded-lg font-semibold text-xs tracking-wide uppercase shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isClustering ? 'MENGHITUNG KLASTER...' : `JALANKAN K-MEANS (K=${selectedK})`}
            </button>
          </div>
        </div>

        <div className="mb-10 p-5 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">Metode Elbow (Penentuan K Optimal)</h2>
              <p className="text-[11px] text-slate-500 mt-1">Menghitung WCSS untuk K = 1 sampai 8. Titik "siku" pada grafik menunjukkan jumlah klaster yang paling optimal.</p>
            </div>
            <button
              onClick={runElbowMethod}
              disabled={isRunningElbow}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide uppercase transition-colors disabled:opacity-50 whitespace-nowrap border border-slate-700"
            >
              {isRunningElbow ? 'MENGHITUNG WCSS...' : 'Hitung Metode Elbow'}
            </button>
          </div>

          {elbowResults.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-end gap-3 h-40 px-2">
                {elbowResults.map((r) => {
                  const heightPct = maxWcss > 0 ? (r.wcss / maxWcss) * 100 : 0;
                  const isSelected = r.k === selectedK;
                  return (
                    <button
                      key={r.k}
                      onClick={() => setSelectedK(r.k)}
                      className="flex-1 h-full flex flex-col items-center gap-1.5 group"
                      title={`WCSS pada K=${r.k}: ${r.wcss.toFixed(3)}`}
                    >
                      <span className="text-[9px] font-semibold text-slate-500">{r.wcss.toFixed(1)}</span>
                      <div
                        className={`w-full rounded-t-sm transition-all ${isSelected ? 'bg-slate-400' : 'bg-slate-700 group-hover:bg-slate-600'}`}
                        style={{ height: `${Math.max(heightPct, 3)}%` }}
                      ></div>
                      <span className={`text-[10px] font-semibold ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>K={r.k}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-3">Klik salah satu bar untuk langsung memilih nilai K tersebut sebagai K final di panel atas.</p>
            </div>
          )}
        </div>

        {lastDbi !== null && (
          <div className="mb-10 p-4 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-wrap items-center gap-6">
            <div>
              <span className="block text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Davies-Bouldin Index</span>
              <span className="text-lg font-bold text-slate-200">{lastDbi.toFixed(4)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Konvergen Pada Iterasi</span>
              <span className="text-lg font-bold text-slate-200">{lastIterations}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Nilai K Digunakan</span>
              <span className="text-lg font-bold text-slate-200">{selectedK}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Terakhir Dijalankan</span>
              <span className="text-sm font-medium text-slate-400">{lastRunAt}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          <div className="p-6 border border-slate-800 rounded-xl bg-slate-900/60 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold mb-1 text-slate-200">Registrasi Klaster Genre</h2>
              <p className="text-[11px] text-slate-500 mb-4">Tambahkan genre baru ke daftar pilihan (permanen setelah dipakai minimal 1 game)</p>

              <form onSubmit={handleAddGenre} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Misal: STRATEGY, SIMULATION"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  className="p-3 bg-slate-950 border border-slate-700 rounded-lg flex-1 text-xs focus:outline-none focus:border-slate-500 text-slate-200"
                  required
                />
                <button type="submit" className="bg-slate-700 hover:bg-slate-600 text-slate-100 px-5 rounded-lg text-xs font-semibold transition-colors">
                  SIMPAN
                </button>
              </form>
            </div>

            <div className="mt-8">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest block mb-2">Genre Aktif (dari dataset_raw):</span>
              <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-1">
                {availableGenreNames.map((name, i) => (
                  <span key={i} className="px-3 py-1 bg-slate-950 text-slate-400 text-[10px] font-semibold rounded-md border border-slate-800">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 border border-slate-800 rounded-xl bg-slate-900/60 shadow-sm">
            <h2 className="text-base font-semibold mb-1 text-slate-200">Injeksi Objek Dataset</h2>
            <p className="text-[11px] text-slate-500 mb-4">Input parameter data latih. Data otomatis tersinkronisasi ke katalog utama</p>

            <form onSubmit={handleAddGame} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Judul Game</label>
                <input
                  type="text"
                  placeholder="Nama Game Berasaskan Dataset"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nama File Gambar (di folder public)</label>
                <input
                  type="text"
                  placeholder="Contoh: gta5.jpg atau /mlbb.png"
                  value={imagePath}
                  onChange={(e) => setImagePath(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Relasi Genre</label>
                  <select
                    value={genreId}
                    onChange={(e) => setGenreId(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    <option value="">Pilih Genre</option>
                    {availableGenreNames.map((name, i) => (
                      <option key={i} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Bobot Nilai (Rating 1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-slate-100 p-3 rounded-lg font-semibold text-xs tracking-wide uppercase transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'MENGINJEKSI DATA...' : 'Simpan & Update Centroid K-Means'}
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-12">

          <div className="mb-8">
            <h2 className="text-lg font-semibold tracking-tight text-slate-200">
              Katalog Eksplorasi {sortMode === 'trending' ? '(Top Games)' : sortMode === 'az' ? '(Game List A-Z)' : ''}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery
                ? `Menampilkan hasil pencarian untuk "${searchQuery}"`
                : 'Saring koleksi berdasarkan hasil pembagian klaster dataset. Klik Card untuk melakukan Edit Data.'}
            </p>
          </div>

          {sortMode === 'az' && (
            <div className="flex flex-wrap gap-2 justify-center bg-slate-900/60 p-4 rounded-xl border border-slate-800 mb-8">
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
          )}

          {displayedGames.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-6">
              {displayedGames.map((game, index) => (
                <GameCard key={game.id || index} game={game} onClick={() => handleOpenEditModal(game)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
              <span className="text-4xl block mb-2 opacity-60">🔍</span>
              <p className="text-slate-500 font-medium text-sm">Tidak ada objek game di klaster ini.</p>
            </div>
          )}
        </div>

      </div>

      {selectedGame && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 md:p-8 max-h-[90vh] overflow-y-auto">

            <button onClick={() => setSelectedGame(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors text-sm font-semibold">✕</button>

            <div className="mb-4 border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">Kelola Detail Game</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Edit atau hapus data game ini dari database.</p>
            </div>

            <div className="space-y-4 pt-2">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ubah Judul Game</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ubah Kategori Genre</label>
                  <select
                    value={editGenreId}
                    onChange={(e) => setEditGenreId(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    {availableGenreNames.map((name, i) => (
                      <option key={i} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Nama File Gambar / URL</label>
                  <input
                    type="text"
                    value={editImagePath}
                    onChange={(e) => setEditImagePath(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ubah Rating</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    value={editRating}
                    onChange={(e) => setEditRating(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-800 mt-4">
                <button
                  onClick={handleSaveChanges}
                  disabled={isUpdating}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold rounded-lg transition-colors uppercase tracking-wide"
                >
                  {isUpdating ? 'MENYIMPAN...' : 'Simpan Perubahan'}
                </button>
                <button
                  onClick={() => setSelectedGame(null)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
                >
                  Batal
                </button>
              </div>

              <button
                onClick={handleDeleteGame}
                disabled={isUpdating}
                className="w-full mt-2 py-2.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 text-xs font-semibold rounded-lg transition-colors uppercase tracking-wide border border-red-900/40"
              >
                Hapus Game Permanen
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}