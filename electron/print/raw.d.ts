// Vite '?raw' içe aktarımı: dosya içeriği derleme anında metin olarak gömülür (windows.ps1)
declare module '*?raw' {
  const content: string;
  export default content;
}
