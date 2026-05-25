/**
 * Google Drive sync — saves/loads profile to a hidden app folder.
 * Uses drive.appdata scope (app-only access, not full Drive).
 * Token must have drive.appdata scope — see useGoogleAuth in Browse.jsx.
 */

const FILE_NAME = 'immerse-profile.json'
const SPACES    = 'appDataFolder'
const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

async function getHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** Find existing profile file ID, or null */
async function findFile(token) {
  const url = `${FILES_URL}?spaces=${SPACES}&q=name='${FILE_NAME}'&fields=files(id,name)`
  const res = await fetch(url, { headers: await getHeaders(token) })
  if (!res.ok) throw new Error(`Drive list error: ${res.status}`)
  const data = await res.json()
  return data.files?.[0]?.id || null
}

/** Upload profile JSON to Drive appDataFolder */
export async function saveToGoogleDrive(token, profileData) {
  const content = JSON.stringify(profileData, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const existingId = await findFile(token)

  let url, method
  if (existingId) {
    url = `${UPLOAD_URL}/${existingId}?uploadType=media`
    method = 'PATCH'
  } else {
    // Create new file with metadata first
    const meta = { name: FILE_NAME, parents: [SPACES] }
    const metaRes = await fetch(FILES_URL, {
      method: 'POST',
      headers: await getHeaders(token),
      body: JSON.stringify(meta),
    })
    if (!metaRes.ok) throw new Error(`Drive create error: ${metaRes.status}`)
    const { id } = await metaRes.json()
    url = `${UPLOAD_URL}/${id}?uploadType=media`
    method = 'PATCH'
  }

  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: content,
  })
  if (!res.ok) throw new Error(`Drive upload error: ${res.status}`)
}

/** Load profile JSON from Drive appDataFolder */
export async function loadFromGoogleDrive(token) {
  const id = await findFile(token)
  if (!id) return null

  const res = await fetch(`${FILES_URL}/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive download error: ${res.status}`)
  return res.json()
}
