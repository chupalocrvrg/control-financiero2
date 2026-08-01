const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

// I will insert functions for image upload and resize
const imageFunctions = `
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setProfileData({ ...profileData, photoUrl: dataUrl });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
`;

content = content.replace('  const handleSaveProfile = async () => {', imageFunctions + '\n  const handleSaveProfile = async () => {');

// Replace the URL input div
const newUI = `                  <div className="space-y-3 flex-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Foto de Perfil</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="url"
                        value={profileData.photoUrl}
                        onChange={(e) => setProfileData({ ...profileData, photoUrl: e.target.value })}
                        className="flex-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="URL de la imagen"
                      />
                      <label className="cursor-pointer bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-4 py-3 rounded-xl font-bold text-sm text-center hover:bg-indigo-100 transition-colors whitespace-nowrap">
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        Subir Foto
                      </label>
                      {user?.photoURL && (
                        <button
                          onClick={() => setProfileData({ ...profileData, photoUrl: user.photoURL || '' })}
                          className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-4 py-3 rounded-xl font-bold text-sm hover:bg-neutral-200 transition-colors whitespace-nowrap"
                        >
                          Usar Google
                        </button>
                      )}
                    </div>
                  </div>`;

const regex = /<div className="space-y-2 flex-1">[\s\S]*?<\/div>\s*<\/div>\s*<div className="grid grid-cols-1 md:grid-cols-2 gap-6">/;
content = content.replace(regex, newUI + '\n                </div>\n                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">');

fs.writeFileSync('src/pages/Settings.tsx', content);
