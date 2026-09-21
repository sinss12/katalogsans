'use client';
import Link from 'next/link';
import { mockGames } from '@/app/page'; // Ngambil mock data dari home biar sama

export default function GenrePage({ params }: { params: { slug: string } }) {
  // Ambil nama genre dari URL (slug)
  const currentGenre = params.slug.toUpperCase();

  // Filter game yang genrenya sesuai dengan URL
  const gamesInGenre = mockGames.filter(g => g.genreName.toUpperCase() === currentGenre);

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <span key={i} className={`text-lg ${i < rating ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]' : 'text-gray-600'}`}>★</span>
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans pb-20 p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center text-slate-400 hover:text-cyan-400 mb-8 transition-colors">
          <span className="mr-2">←</span> Kembali ke Katalog
        </Link>

        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
            Kategori: <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">{currentGenre}</span>
          </h1>
          <p className="text-slate-400 text-lg">Menampilkan semua game dalam genre {currentGenre}.</p>
        </div>

        {gamesInGenre.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {gamesInGenre.map(game => (
              <div key={game.id} className="group flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-105 hover:bg-slate-800 hover:border-slate-600">
                <div className={`h-32 w-full bg-gradient-to-br ${game.coverGradient} flex items-center justify-center`}>
                  <span className="text-4xl font-black text-white/30 drop-shadow-md">{game.title.charAt(0)}</span>
                </div>
                <div className="p-4 z-10 bg-inherit flex flex-col justify-between h-full">
                  <div>
                    <h3 className="font-bold text-slate-200 truncate">{game.title}</h3>
                  </div>
                  <div className="mt-3">
                    {renderStars(game.rating)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-6xl mb-4 block">🏜️</span>
            <h3 className="text-xl font-bold text-slate-400">Belum ada game di kategori ini.</h3>
          </div>
        )}
      </div>
    </main>
  );
}