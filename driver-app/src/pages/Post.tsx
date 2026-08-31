import { Navigate } from 'react-router-native';

const Post = () => {
    return <Navigate to="/available?post=new" replace />;
};

export default Post;
