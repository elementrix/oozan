# Oozan Portfolio

Astro + Markdown 콘텐츠 컬렉션으로 만든 정적 포트폴리오. GitHub Pages(GitHub Actions)로 배포합니다.

## 개발

```sh
npm install
npm run dev       # localhost:4321
npm run build     # ./dist 로 빌드
npm run preview   # 빌드 결과 미리보기
```

## 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드 후 GitHub Pages에 배포합니다.

최초 1회, GitHub repo → Settings → Pages → **Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.

배포 주소: `astro.config.mjs`의 `site`/`base` 값을 사용하는 repo/사용자명에 맞게 확인하세요.

## 콘텐츠 수정하기 (MD 파일만 고치면 됩니다)

| 위치 | 설명 |
| --- | --- |
| `src/content/films/*.md` | 필모 4편. `youtubeId`를 유튜브 업로드 후 영상 ID로 교체하세요 (`REPLACE_ME` → 실제 ID). |
| `src/content/compositions/*.md` | 작곡 5곡. mp3 4곡은 그대로 재생되고, 영상 1편(`그리운 노래`)은 `youtubeId` 교체가 필요합니다. |
| `src/content/research/*.md` | 연구 논문. `abstract`/`authors`/`doi` 등을 자유롭게 수정하세요. |
| `src/content/people/*.md` | 스냅 인물 7명. `slug`는 `src/assets/snap/<slug>/` 폴더명과 반드시 일치해야 합니다. |

### 유튜브 영상 연결하기

1. 영상을 YouTube에 업로드 (비공개 또는 일부 공개 모두 임베드 가능)
2. 영상 URL에서 ID 부분만 복사 (`https://youtu.be/`**`abcd1234XYZ`**)
3. 해당 md 파일의 `youtubeId: "REPLACE_ME"`를 `youtubeId: "abcd1234XYZ"`로 교체

### 스냅에 새 인물 추가하기

1. `src/assets/snap/<새-슬러그>/`에 사진들을 넣기 (jpg 권장, 파일명 무관)
2. `src/content/people/`에 새 md 파일 추가:
   ```md
   ---
   name: "이름"
   slug: "새-슬러그"
   order: 8
   ---
   ```

### 로고 교체하기

지금은 헤더에 `OOZAN` 텍스트 워드마크가 있습니다. 로고 이미지를 받으면 `src/components/Header.astro`의
`.site-header__brand` 부분을 이미지로 교체하면 됩니다.

## 대용량 영상 원본

원본 필모/작곡 영상 파일(수백 MB~1GB대)은 이 저장소에 포함하지 않았습니다. YouTube에 업로드한 뒤
위 방법대로 `youtubeId`만 연결하세요.
