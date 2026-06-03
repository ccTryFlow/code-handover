<template>
  <el-card class="source-card" shadow="hover" @click="handleClick">
    <div class="card-content">
      <div class="icon-wrapper">
        <component :is="icon" class="card-icon" />
      </div>
      <h3 class="card-title">{{ title }}</h3>
      <span class="card-description">
        {{ description }}
        <el-icon class="arrow-icon"><ArrowRight /></el-icon>
      </span>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Folder, Download, ArrowRight } from '@element-plus/icons-vue'

interface Props {
  title: string
  description: string
  icon: typeof Folder | typeof Download
  route: string
}

const props = defineProps<Props>()
const router = useRouter()

const handleClick = () => {
  router.push(props.route)
}
</script>

<style scoped>
.source-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  border-radius: 12px;
  height: 220px;
}

.source-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(64, 158, 255, 0.15) !important;
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px;
  position: relative;
  height: 100%;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.card-icon {
  font-size: 32px;
  color: white;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px 0;
}

.card-description {
  font-size: 14px;
  color: #606266;
  margin: 0;
  line-height: 1.5;
}

.arrow-icon {
  font-size: 14px;
  vertical-align: middle;
  color: #409eff;
  transition: transform 0.3s ease;
}

.source-card:hover .arrow-icon {
  transform: translateX(4px);
}
</style>
