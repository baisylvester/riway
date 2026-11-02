import { session } from "@/lib/data";
import { MediaUpload } from "@/components/media-upload";
export default async function Media() {
  const { client } = await session();
  const { data, error } = await client
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw Error("Media library unavailable");
  const rows = await Promise.all(
    data.map(async (r) => {
      const { data } = await client.storage
        .from("editorial-media")
        .createSignedUrl(r.object_path, 60);
      return { ...r, url: data?.signedUrl };
    }),
  );
  return (
    <>
      <h1>Editorial media</h1>
      <MediaUpload />
      <div className="cards" style={{ marginTop: 30 }}>
        {rows.map((r) => (
          <div className="card" key={r.id}>
            {r.url && (
              <img
                src={r.url}
                width={240}
                height={160}
                style={{ objectFit: "contain", maxWidth: "100%" }}
                alt={r.file_name}
              />
            )}
            <h3>{r.file_name}</h3>
            <p>
              {r.market} · {Math.ceil(r.size_bytes / 1024)} KiB
            </p>
            <span className="status">Private editorial asset</span>
          </div>
        ))}
      </div>
      {!rows.length && <p style={{ marginTop: 25 }}>No media uploaded.</p>}
    </>
  );
}
