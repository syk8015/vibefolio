-- Vibefolio DB Schema
-- Run this in Supabase Dashboard > SQL Editor

-- 1. 프로필 테이블
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  name text,
  bio text,
  twitter text,
  github text,
  avatar_url text,
  social_links text[] default '{}',
  updated_at timestamptz default now()
);

-- RLS: 본인만 수정, 누구나 읽기
alter table profiles enable row level security;

create policy "누구나 프로필 읽기"
  on profiles for select using (true);

create policy "본인만 프로필 수정"
  on profiles for insert with check (auth.uid() = id);

create policy "본인만 프로필 업데이트"
  on profiles for update using (auth.uid() = id);

-- 2. 프로젝트 테이블
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  description text,
  type text check (type in ('image', 'video')) default 'image',
  thumbnail text,
  year text,
  tags text[] default '{}',
  demo_url text,
  comment text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- RLS: 본인만 수정, 누구나 읽기
alter table projects enable row level security;

create policy "누구나 프로젝트 읽기"
  on projects for select using (true);

create policy "본인만 프로젝트 추가"
  on projects for insert with check (auth.uid() = user_id);

create policy "본인만 프로젝트 수정"
  on projects for update using (auth.uid() = user_id);

create policy "본인만 프로젝트 삭제"
  on projects for delete using (auth.uid() = user_id);
