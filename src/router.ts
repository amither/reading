import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/Home.vue') },
    { path: '/settings', component: () => import('./views/Settings.vue') },
    { path: '/task/:id', component: () => import('./views/TaskDetail.vue') },
    { path: '/task/:id/record', component: () => import('./views/Record.vue') },
    { path: '/task/:id/checkin/:date', component: () => import('./views/CheckinRecord.vue') },
    { path: '/task/:id/rank', component: () => import('./views/Leaderboard.vue') },
    { path: '/task/:id/quiz/:date', component: () => import('./views/Quiz.vue') },
  ],
})
