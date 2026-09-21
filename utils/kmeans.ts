export interface Game {
  id: string;
  title: string;
  genreId: number; // K-Means butuh angka, jadi genre dikasih ID numerik
  genreName: string;
  rating: number; // 1 - 5
  isTrending: boolean;
}

// Fungsi hitung jarak Euclidean
const calculateDistance = (point1: number[], point2: number[]) => {
  return Math.sqrt(
    Math.pow(point1[0] - point2[0], 2) + Math.pow(point1[1] - point2[1], 2)
  );
};

export const runKMeans = (games: Game[], k: number = 3) => {
  // 1. Inisialisasi centroid awal (diambil acak dari data)
  let centroids = games.slice(0, k).map((g) => [g.genreId, g.rating]);
  let clusters: Game[][] = Array.from({ length: k }, () => []);
  let hasChanged = true;
  let iterations = 0;

  // 2. Looping sampai konvergen (centroid tidak berubah)
  while (hasChanged && iterations < 100) {
    clusters = Array.from({ length: k }, () => []);

    // Assign tiap game ke cluster terdekat
    games.forEach((game) => {
      let minDist = Infinity;
      let clusterIndex = 0;

      centroids.forEach((centroid, idx) => {
        const dist = calculateDistance([game.genreId, game.rating], centroid);
        if (dist < minDist) {
          minDist = dist;
          clusterIndex = idx;
        }
      });
      clusters[clusterIndex].push(game);
    });

    // 3. Update centroid baru berdasarkan rata-rata tiap cluster
    const newCentroids = clusters.map((cluster) => {
      if (cluster.length === 0) return [0, 0];
      const sumGenre = cluster.reduce((sum, g) => sum + g.genreId, 0);
      const sumRating = cluster.reduce((sum, g) => sum + g.rating, 0);
      return [sumGenre / cluster.length, sumRating / cluster.length];
    });

    // Cek apakah centroid berubah
    hasChanged = JSON.stringify(centroids) !== JSON.stringify(newCentroids);
    centroids = newCentroids;
    iterations++;
  }

  return clusters;
};