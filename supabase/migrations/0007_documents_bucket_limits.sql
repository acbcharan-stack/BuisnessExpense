-- Direct-to-storage image uploads: the browser now writes into the `documents`
-- bucket itself (via a server-issued signed URL), so the bucket must enforce
-- the limits the app server used to enforce. The app still re-checks the real
-- file contents afterwards (/api/documents/finalize).
update storage.buckets
set file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'image/heic', 'image/heif', 'application/pdf'
    ]
where id = 'documents';
