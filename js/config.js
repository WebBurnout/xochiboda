const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(
  new URL(import.meta.url).hostname,
)

export const supabaseConfig = isDevelopment
  ? {
      url: 'http://127.0.0.1:54321',
      anonKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
    }
  : {
      url: 'https://qlaytgdgkauhqmjzjdqj.supabase.co',
      anonKey: 'sb_publishable_Ofe1fFGeVdTnRjwU8-Vx7Q_hMaBDCBI',
    }
