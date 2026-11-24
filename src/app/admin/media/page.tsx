import { session } from "@/lib/data";
import { MediaUpload } from "@/components/media-upload";
import { r2Storage } from "@/services/r2-storage";
import { MediaPublish, MediaUnpublish } from "@/components/media-publication";
export default async function Media() {
  const { client, user } = await session();
  const { data, error } = await client
    .from("media_assets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw Error("Media library unavailable");
  const rows = await Promise.all(
    data.map(async (r) => {
      if (r.storage_provider === "r2") {
        try {
          return { ...r, url: await r2Storage().preview(r.object_path) };
        } catch {
          return { ...r, url: undefined };
        }
      }
      const { data } = await client.storage
        .from("editorial-media")
        .createSignedUrl(r.object_path, 60);
      return { ...r, url: data?.signedUrl };
    }),
  );
  return (
    <>
      <h1>Editorial media</h1>
      <p className="muted">
        Uploads stay private. A market admin or compliance reviewer other than
        the uploader can publish an approved image with its approval reference;
        published images can then be attached to stories, events and pages.
      </p>
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
            {r.public_url ? (
              <>
                <span className="status">
                  Published · {r.approval_reference}
                </span>
                <MediaUnpublish id={r.id} url={r.public_url} />
              </>
            ) : (
              <>
                <span className="status">Private editorial asset</span>
                {r.storage_provider === "supabase" &&
                  (r.uploaded_by === user?.id ? (
                    <p className="small muted">
                      Another market admin or compliance reviewer must publish
                      your upload.
                    </p>
                  ) : (
                    <MediaPublish id={r.id} />
                  ))}
              </>
            )}
          </div>
        ))}
      </div>
      {!rows.length && <p style={{ marginTop: 25 }}>No media uploaded.</p>}
    </>
  );
}
