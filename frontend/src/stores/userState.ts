import { defineStore } from 'pinia'

// アプリケーションの状態を管理するPiniaストアを定義
export const useUserState = defineStore('userState', {
  // 管理する状態（state）
  state: () => ({
    /**
     * 現在の推定心拍数 (BPM)
     */
    heartRate: 0,
    /**
     * 現在の運動強度 (0.0 ~ 1.0)
     */
    exerciseIntensity: 0.0,
    /**
     * バックエンドが最後に生成したBGMのプロンプト
     */
    lastMusicPrompt: '',
  }),

  // 状態を更新するためのメソッド（actions）
  actions: {
    /**
     * 複数の状態を一度に更新します。
     * @param payload - 更新したい状態のキーと値を持つオブジェクト
     */
    updateState(payload: { heartRate?: number; exerciseIntensity?: number }) {
      if (payload.heartRate !== undefined) {
        this.heartRate = payload.heartRate
      }
      if (payload.exerciseIntensity !== undefined) {
        this.exerciseIntensity = payload.exerciseIntensity
      }
    },

    /**
     * 最後に使用された音楽生成プロンプトを保存します。
     * @param prompt - バックエンドから受け取ったプロンプト文字列
     */
    setLastMusicPrompt(prompt: string) {
      this.lastMusicPrompt = prompt
    },
  },
})
