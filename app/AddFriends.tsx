import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from '../firebase';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface FriendRequest {
  from: string;
  status: 'pending' | 'accepted';
  sentAt: any;
}

// 🆕 HÀM TẠO CONVERSATION KHI KẾT BẠN
const createConversation = async (user1Id: string, user2Id: string): Promise<string> => {
  try {
    // Tạo conversationId theo thứ tự alphabet để tránh trùng lặp
    const participants = [user1Id, user2Id].sort();
    const conversationId = participants.join('_');
    
    console.log('🔄 Tạo conversation mới:', conversationId);
    
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    
    if (!conversationSnap.exists()) {
      await setDoc(conversationRef, {
        id: conversationId,
        participants,
        lastMessage: '👋 Đã trở thành bạn bè. Hãy bắt đầu trò chuyện!',
        lastMessageTime: serverTimestamp(),
        unreadCount: 0,
        isNewFriend: true,
        createdAt: serverTimestamp()
      });
      console.log('✅ Đã tạo conversation mới cho bạn bè');
    } else {
      console.log('✅ Conversation đã tồn tại');
    }
    
    return conversationId;
  } catch (error: any) {
    console.error('❌ Lỗi tạo conversation:', error);
    throw new Error(`Không thể tạo conversation: ${error.message}`);
  }
};

const AddFriends: React.FC = () => {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<any[]>([]);

  // Khởi tạo user data
  const initializeUserData = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          friends: [],
          friendRequests: [],
          createdAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Lỗi khởi tạo user data:', error);
    }
  };

  // Tìm kiếm user bằng email
  const searchUsers = async () => {
    if (!searchEmail.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập email!');
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', searchEmail.trim().toLowerCase()));
      const snapshot = await getDocs(q);
      
      const results = snapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          email: doc.data().email || '',
          name: doc.data().name || '',
        } as User))
        .filter(u => u.id !== user.uid);

      setSearchResults(results);

      if (results.length === 0) {
        Alert.alert('Không tìm thấy', 'Không tìm thấy người dùng với email này!');
      }
    } catch (error: any) {
      console.error('Lỗi tìm kiếm:', error);
      Alert.alert('Lỗi', 'Không thể tìm kiếm người dùng!');
    }
  };

  // Gửi lời mời kết bạn
  const sendFriendRequest = async (toUserId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const toUserRef = doc(db, 'users', toUserId);
      const toUserSnap = await getDoc(toUserRef);
      
      if (toUserSnap.exists()) {
        const toUserData = toUserSnap.data();
        const existingRequests = toUserData.friendRequests || [];
        
        // Kiểm tra đã gửi lời mời chưa
        if (existingRequests.some((req: any) => req.from === user.uid)) {
          Alert.alert('Thông báo', 'Đã gửi lời mời kết bạn trước đó!');
          return;
        }

        // Kiểm tra đã là bạn bè chưa
        if (toUserData.friends?.includes(user.uid)) {
          Alert.alert('Thông báo', 'Đã là bạn bè!');
          return;
        }
      }

      // Thêm lời mời vào friendRequests của người nhận
      await updateDoc(toUserRef, {
        friendRequests: arrayUnion({
          from: user.uid,
          status: 'pending',
          sentAt: new Date(),
        }),
      });

      Alert.alert('Thành công', 'Đã gửi lời mời kết bạn!');
      setSearchResults([]);
      setSearchEmail('');
    } catch (error) {
      console.error('Lỗi gửi lời mời:', error);
      Alert.alert('Lỗi', 'Không thể gửi lời mời kết bạn!');
    }
  };

  // 🆕 CHẤP NHẬN LỜI MỜI KẾT BẠN - ĐÃ THÊM TẠO CONVERSATION
  const acceptFriendRequest = async (fromUserId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const fromUserRef = doc(db, 'users', fromUserId);

      const userSnap = await getDoc(userRef);
      const fromUserSnap = await getDoc(fromUserRef);

      if (!fromUserSnap.exists() || !userSnap.exists()) {
        Alert.alert('Lỗi', 'Người dùng không tồn tại!');
        return;
      }

      const userData = userSnap.data();
      const currentRequests = userData.friendRequests || [];

      // ✅ Lọc bỏ lời mời đã chấp nhận
      const updatedRequests = currentRequests.filter(
        (req: any) => req.from !== fromUserId
      );

      // Cập nhật lại friendRequests (đã loại bỏ)
      await updateDoc(userRef, {
        friendRequests: updatedRequests,
      });

      // ✅ Thêm vào danh sách bạn bè của cả hai bên
      await updateDoc(userRef, {
        friends: arrayUnion(fromUserId),
      });

      await updateDoc(fromUserRef, {
        friends: arrayUnion(user.uid),
      });

      // 🆕 TẠO CONVERSATION CHO BẠN BÈ MỚI
      try {
        await createConversation(user.uid, fromUserId);
        console.log('✅ Đã tạo conversation cho bạn bè mới');
      } catch (conversationError) {
        console.error('❌ Lỗi tạo conversation:', conversationError);
        // Vẫn tiếp tục kết bạn dù có lỗi tạo conversation
      }

      Alert.alert('Thành công', 'Đã chấp nhận lời mời kết bạn!');
    } catch (error) {
      console.error('Lỗi chấp nhận kết bạn:', error);
      Alert.alert('Lỗi', 'Không thể chấp nhận lời mời!');
    }
  };

  // Từ chối lời mời kết bạn
  const rejectFriendRequest = async (fromUserId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const currentRequests = userData.friendRequests || [];

      // ✅ Lọc bỏ lời mời đã từ chối
      const updatedRequests = currentRequests.filter(
        (req: any) => req.from !== fromUserId
      );

      await updateDoc(userRef, {
        friendRequests: updatedRequests,
      });

      Alert.alert('Thành công', 'Đã từ chối lời mời kết bạn!');
    } catch (error) {
      console.error('Lỗi từ chối kết bạn:', error);
      Alert.alert('Lỗi', 'Không thể từ chối lời mời!');
    }
  };

  // 🆕 HỦY KẾT BẠN - ĐÃ THÊM XÓA CONVERSATION
  const removeFriend = async (friendId: string) => {
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn hủy kết bạn? Cuộc trò chuyện cũng sẽ bị xóa.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đồng ý',
          style: 'destructive',
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;

            try {
              const userRef = doc(db, 'users', user.uid);
              const friendRef = doc(db, 'users', friendId);

              // Xóa khỏi danh sách bạn bè
              await updateDoc(userRef, {
                friends: arrayRemove(friendId),
              });

              await updateDoc(friendRef, {
                friends: arrayRemove(user.uid),
              });

              // 🆕 XÓA CONVERSATION
              try {
                const conversationId = [user.uid, friendId].sort().join('_');
                const conversationRef = doc(db, 'conversations', conversationId);
                await setDoc(conversationRef, { 
                  deleted: true 
                }, { merge: true });
                console.log('✅ Đã đánh dấu xóa conversation');
              } catch (conversationError) {
                console.error('❌ Lỗi xóa conversation:', conversationError);
              }

              Alert.alert('Thành công', 'Đã hủy kết bạn!');
            } catch (error) {
              console.error('Lỗi hủy kết bạn:', error);
              Alert.alert('Lỗi', 'Không thể hủy kết bạn!');
            }
          },
        },
      ]
    );
  };

  // Load danh sách bạn bè với real-time updates
  const loadFriends = () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      
      return onSnapshot(userRef, async (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const friendIds = userData.friends || [];
          
          const friendsList: User[] = [];
          for (const friendId of friendIds) {
            const friendRef = doc(db, 'users', friendId);
            const friendSnap = await getDoc(friendRef);
            if (friendSnap.exists()) {
              const friendData = friendSnap.data();
              friendsList.push({ 
                id: friendId, 
                email: friendData.email || '',
                name: friendData.name 
              });
            }
          }
          
          setFriends(friendsList);
        }
      });
    } catch (error) {
      console.error('Lỗi tải danh sách bạn:', error);
      return undefined;
    }
  };

  // Load lời mời đã nhận với real-time updates
  const loadReceivedRequests = () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      
      return onSnapshot(userRef, async (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const requests = userData.friendRequests || [];
          
          const requestsWithUserInfo = [];
          for (const request of requests) {
            const fromUserRef = doc(db, 'users', request.from);
            const fromUserSnap = await getDoc(fromUserRef);
            if (fromUserSnap.exists()) {
              const fromUserData = fromUserSnap.data();
              requestsWithUserInfo.push({
                ...request,
                fromUser: { 
                  id: request.from, 
                  email: fromUserData.email || '',
                  name: fromUserData.name 
                },
              });
            }
          }
          
          setReceivedRequests(requestsWithUserInfo);
        }
      });
    } catch (error) {
      console.error('Lỗi tải lời mời:', error);
      return undefined;
    }
  };

  useEffect(() => {
    initializeUserData();
    
    // Sử dụng onSnapshot để real-time updates
    const unsubscribeFriends = loadFriends();
    const unsubscribeRequests = loadReceivedRequests();

    return () => {
      if (unsubscribeFriends) unsubscribeFriends();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>👥 Kết Bạn</Text>
        <Text style={styles.subtitle}>Kết nối với bạn bè để cùng quản lý chi tiêu và nhắn tin</Text>
      </View>

      {/* Tìm kiếm bằng email */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔍 Tìm bạn bằng email</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 10 }]}
            placeholder="Nhập email của bạn bè..."
            value={searchEmail}
            onChangeText={setSearchEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.searchButton} onPress={searchUsers}>
            <Text style={styles.searchButtonText}>Tìm</Text>
          </TouchableOpacity>
        </View>

        {/* Kết quả tìm kiếm */}
        {searchResults.map(user => (
          <View key={user.id} style={styles.searchResult}>
            <Text style={styles.userEmail}>👤 {user.email}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => sendFriendRequest(user.id)}
            >
              <Text style={styles.addButtonText}>➕ Kết bạn</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Lời mời đã nhận */}
      {receivedRequests.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📨 Lời mời kết bạn ({receivedRequests.length})</Text>
          {receivedRequests.map((request, index) => (
            <View key={request.from} style={styles.requestItem}>
              <Text style={styles.userEmail}>
                👤 {request.fromUser?.email || 'Unknown'}
              </Text>
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptFriendRequest(request.from)}
                >
                  <Text style={styles.acceptButtonText}>✓ Chấp nhận</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => rejectFriendRequest(request.from)}
                >
                  <Text style={styles.rejectButtonText}>✗ Từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Danh sách bạn bè */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👋 Bạn bè ({friends.length})</Text>
        <Text style={styles.noteText}>
          💬 Bạn bè sẽ tự động xuất hiện trong mục Tin Nhắn
        </Text>
        {friends.length > 0 ? (
          friends.map(friend => (
            <View key={friend.id} style={styles.friendItem}>
              <View style={styles.friendInfo}>
                <Text style={styles.userEmail}>👤 {friend.email}</Text>
                <Text style={styles.chatHint}>💬 Có thể nhắn tin</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFriend(friend.id)}
              >
                <Text style={styles.removeButtonText}>🗑️ Hủy</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noFriendsText}>
            Chưa có bạn bè nào. Hãy tìm và kết bạn!
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffafc',
  },
  header: {
    backgroundColor: '#fff0f5',
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#ff9ec6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#d63384',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#ff9ec6',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#ff9ec6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#fff0f5',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d63384',
    marginBottom: 16,
  },
  noteText: {
    fontSize: 12,
    color: '#ff6b9d',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: {
    borderWidth: 2,
    borderColor: '#ffe6ee',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    backgroundColor: 'white',
    color: '#d63384',
    shadowColor: '#ff9ec6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchButton: {
    backgroundColor: '#ff6b9d',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  searchResult: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginTop: 8,
  },
  userEmail: {
    color: '#333',
    fontWeight: '500',
  },
  chatHint: {
    color: '#ff6b9d',
    fontSize: 10,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#4facfe',
    padding: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  requestItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginTop: 8,
  },
  requestActions: {
    flexDirection: 'row',
  },
  acceptButton: {
    backgroundColor: '#27ae60',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  acceptButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  rejectButton: {
    backgroundColor: '#e74c3c',
    padding: 8,
    borderRadius: 6,
  },
  rejectButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  friendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginTop: 8,
  },
  friendInfo: {
    flex: 1,
  },
  removeButton: {
    backgroundColor: '#e74c3c',
    padding: 8,
    borderRadius: 6,
  },
  removeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  noFriendsText: {
    color: '#ff9ec6',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
});

export default AddFriends;
