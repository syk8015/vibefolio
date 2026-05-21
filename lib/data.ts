export interface Project {
  id: number;
  title: string;
  description: string;
  type: "image" | "video";
  thumbnail: string;
  year: string;
  tags: string[];
  demoUrl?: string;
  comment?: string;
  contentType?: string | null;
  isFeatured?: boolean;
  videoUrl?: string;
}

export const profile = {
  name: "Alex Vibe",
  avatar: "https://i.pravatar.cc/300?img=12",
  bio: "저는 코드를 모르지만, 아이디어를 현실로 만드는 것을 사랑합니다.\n바이브코딩으로 탄생한 저의 작은 우주들을 소개합니다.",
  social: {
    twitter: "https://twitter.com",
    github: "https://github.com",
  },
};

export const projects: Project[] = [
  {
    id: 1,
    title: "Todo Universe",
    description: "별자리처럼 연결된 할 일 관리 앱. 완료된 태스크가 별이 됩니다.",
    type: "image",
    thumbnail: "https://picsum.photos/seed/todo/800/600",
    year: "2025",
    tags: ["React", "Canvas API"],
    demoUrl: "https://todo-universe.vercel.app",
    comment: "제가 제일 아끼는 작업물이에요! ⭐",
  },
  {
    id: 2,
    title: "Mood Board AI",
    description: "감정을 입력하면 AI가 어울리는 색감과 이미지를 큐레이션해주는 보드.",
    type: "video",
    thumbnail: "https://picsum.photos/seed/mood/800/600",
    year: "2025",
    tags: ["Claude API", "Next.js"],
    demoUrl: "https://moodboard-ai.vercel.app",
    comment: "AI한테 '예쁘게 해줘'라고 했더니 이게 나왔어요 😳",
  },
  {
    id: 3,
    title: "Letter to Future",
    description: "미래의 나에게 편지를 보내는 타임캡슐 서비스. 미니멀한 타이포그래피.",
    type: "image",
    thumbnail: "https://picsum.photos/seed/letter/800/600",
    year: "2024",
    tags: ["HTML", "CSS"],
    demoUrl: "https://letter-to-future.vercel.app",
    comment: "밤새워 만들고 혼자 울었던 기억이... 🥲",
  },
  {
    id: 4,
    title: "Sound Palette",
    description: "색을 클릭하면 그 색의 감성을 담은 사운드가 재생되는 인터랙티브 앱.",
    type: "video",
    thumbnail: "https://picsum.photos/seed/sound/800/600",
    year: "2025",
    tags: ["Web Audio API", "p5.js"],
    demoUrl: "https://sound-palette.netlify.app",
    comment: "파란색이 제일 좋은 소리가 나요 💙",
  },
  {
    id: 5,
    title: "Recipe Chaos",
    description: "냉장고 재료를 입력하면 AI가 황당하면서도 맛있는 레시피를 생성해주는 앱.",
    type: "image",
    thumbnail: "https://picsum.photos/seed/recipe/800/600",
    year: "2025",
    tags: ["GPT-4", "Tailwind"],
    demoUrl: "https://recipe-chaos.vercel.app",
    comment: "냉장고에 아무것도 없던 날 탄생했어요 🥕",
  },
  {
    id: 6,
    title: "Dream Journal",
    description: "꿈 일기를 작성하면 AI가 꿈의 상징과 감정을 분석해주는 저널 앱.",
    type: "video",
    thumbnail: "https://picsum.photos/seed/dream/800/600",
    year: "2024",
    tags: ["Claude API", "Framer Motion"],
    demoUrl: "https://dream-journal.vercel.app",
    comment: "이상한 꿈 꾸고 바로 만들었어요 🌙",
  },
  {
    id: 7,
    title: "Pixel Weather",
    description: "픽셀 아트 스타일로 날씨를 표현하는 위젯. 비가 오면 픽셀 빗방울이 떨어집니다.",
    type: "image",
    thumbnail: "https://picsum.photos/seed/pixel/800/600",
    year: "2025",
    tags: ["Canvas", "Weather API"],
    demoUrl: "https://pixel-weather.vercel.app",
    comment: "비 오는 날 만들었는데 진짜 비가 내렸어요 🌧️",
  },
  {
    id: 8,
    title: "Typewriter Poems",
    description: "방문할 때마다 다른 AI 시가 타이핑되는 감성적인 시 생성기.",
    type: "video",
    thumbnail: "https://picsum.photos/seed/poem/800/600",
    year: "2025",
    tags: ["Claude API", "CSS Animation"],
    demoUrl: "https://typewriter-poems.vercel.app",
    comment: "첫 번째로 완성한 작업물이에요 ✨",
  },
  {
    id: 9,
    title: "Bookshelf 3D",
    description: "읽은 책들을 3D 책장에 꽂아두는 독서 기록 앱. 책등에 짧은 리뷰가 새겨집니다.",
    type: "image",
    thumbnail: "https://picsum.photos/seed/book/800/600",
    year: "2024",
    tags: ["Three.js", "React"],
    demoUrl: "https://bookshelf-3d.vercel.app",
    comment: "100권 읽기 도전하다 만들었어요 📚",
  },
  {
    id: 10,
    title: "Habit Constellation",
    description: "매일 습관을 기록하면 나만의 별자리가 완성되어가는 습관 트래커.",
    type: "video",
    thumbnail: "https://picsum.photos/seed/habit/800/600",
    year: "2025",
    tags: ["SVG", "D3.js"],
    demoUrl: "https://habit-constellation.vercel.app",
    comment: "매일 까먹는 제 자신 때문에 만들었어요 😅",
  },
];
